import { beforeEach, describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { ListActivePromotionsUseCase } from './list-active-promotions.use-case';
import { Promotion } from '../../domain/entities/promotion.entity';
import { DiscountType } from '../../domain/value-objects/discount-type';
import { PromotionsFetchError } from '../errors/promotions-fetch.error';
import { InvalidPromotionCursorError } from '../errors/invalid-promotion-cursor.error';
import {
  decodeActivePromotionCursor,
  encodeActivePromotionCursor,
} from '../list-active-promotions-cursor';
import type {
  CreatePromotionInput,
  FindActivePromotionsInput,
  FindPromotionsByBusinessUnitInput,
  PromotionRepository,
  RecordOrderPromotionInput,
  UpdatePromotionInput,
} from '../../domain/repositories/promotion.repository';

const promotionCreatedAt = new Date('2026-05-18T10:30:00.000Z');

const promotion = (id: string): Promotion =>
  new Promotion(
    id,
    'bu-1',
    `promo ${id}`,
    DiscountType.FIXED_AMOUNT,
    Money.fromDecimalString('5.00'),
    Money.fromDecimalString('0.00'),
    new Date('2026-06-01T00:00:00.000Z'),
    new Date('2026-06-30T00:00:00.000Z'),
    true,
    promotionCreatedAt,
    new Date(),
  );

class FakePromotionRepository implements PromotionRepository {
  private rows: Promotion[] = [];
  private error: Error | null = null;
  lastInput: FindActivePromotionsInput | null = null;

  seed(rows: Promotion[]): void {
    this.rows = rows;
  }
  failWith(error: Error): void {
    this.error = error;
  }

  findManyActive(input: FindActivePromotionsInput): Promise<Promotion[]> {
    this.lastInput = input;
    if (this.error) {
      return Promise.reject(this.error);
    }
    // Honor the over-fetch take so the use case can detect a next page.
    return Promise.resolve(this.rows.slice(0, input.take));
  }
  findManyByBusinessUnit(_input: FindPromotionsByBusinessUnitInput): Promise<Promotion[]> {
    throw new Error('not used');
  }
  create(_input: CreatePromotionInput): Promise<Promotion> {
    throw new Error('not used');
  }
  findById(_id: string): Promise<Promotion | null> {
    throw new Error('not used');
  }
  update(_id: string, _input: UpdatePromotionInput): Promise<Promotion> {
    throw new Error('not used');
  }
  findActiveEligible(_bu: string, _now: Date, _tx?: TransactionContext): Promise<Promotion[]> {
    throw new Error('not used');
  }
  recordOrderPromotion(_input: RecordOrderPromotionInput, _tx: TransactionContext): Promise<void> {
    throw new Error('not used');
  }
}

describe('ListActivePromotionsUseCase', () => {
  let repository: FakePromotionRepository;
  let useCase: ListActivePromotionsUseCase;

  beforeEach(() => {
    repository = new FakePromotionRepository();
    useCase = new ListActivePromotionsUseCase(repository);
  });

  it('over-fetches by one so the next page can be detected', async () => {
    repository.seed([promotion('p-1'), promotion('p-2'), promotion('p-3')]);

    await useCase.execute({ businessUnitId: 'bu-1', limit: 2 });

    expect(repository.lastInput?.take).toBe(3);
  });

  it('trims the probe row and reports another page', async () => {
    repository.seed([promotion('p-1'), promotion('p-2'), promotion('p-3')]);

    const result = await useCase.execute({ businessUnitId: 'bu-1', limit: 2 });

    expect(result.data.map((p) => p.id)).toEqual(['p-1', 'p-2']);
    expect(result.meta.hasMore).toBe(true);
    // Opaque token carrying the whole sort key, not the bare id.
    expect(result.meta.nextCursor).not.toBeNull();
    expect(decodeActivePromotionCursor(result.meta.nextCursor!)).toEqual({
      id: 'p-2',
      createdAt: promotionCreatedAt.toISOString(),
    });
  });

  it('reports no further page when the probe row is absent', async () => {
    repository.seed([promotion('p-1')]);

    const result = await useCase.execute({ businessUnitId: 'bu-1', limit: 2 });

    expect(result.data).toHaveLength(1);
    expect(result.meta.hasMore).toBe(false);
    expect(result.meta.nextCursor).toBeNull();
  });

  it('returns an empty page when the unit has no valid promotion', async () => {
    repository.seed([]);

    const result = await useCase.execute({ businessUnitId: 'bu-1', limit: 20 });

    expect(result.data).toEqual([]);
    expect(result.meta.hasMore).toBe(false);
  });

  it('decodes the cursor into a keyset the repository can compare on', async () => {
    repository.seed([promotion('p-9')]);
    const cursor = encodeActivePromotionCursor(promotionCreatedAt, 'p-8');

    await useCase.execute({ businessUnitId: 'bu-1', limit: 20, cursor });

    // Both sort terms must reach the repository: an id alone cannot express the
    // keyset predicate, which is the whole reason this listing is not row-cursored.
    expect(repository.lastInput?.keyset).toEqual({ createdAt: promotionCreatedAt, id: 'p-8' });
  });

  it('rejects a malformed cursor as invalid input, not as a fetch outage', async () => {
    repository.seed([promotion('p-1')]);

    // A 422 tells the caller its token is bad. Reporting it as PromotionsFetchError
    // (UNAVAILABLE -> 503) would blame the server for a client-supplied value and
    // pollute outage alerting on a public, unauthenticated route.
    await expect(
      useCase.execute({ businessUnitId: 'bu-1', limit: 20, cursor: 'not-a-real-token' }),
    ).rejects.toBeInstanceOf(InvalidPromotionCursorError);
  });

  it('rejects a cursor whose payload is structurally wrong', async () => {
    const forged = Buffer.from(JSON.stringify({ id: '', createdAt: 'nonsense' })).toString(
      'base64url',
    );

    await expect(
      useCase.execute({ businessUnitId: 'bu-1', limit: 20, cursor: forged }),
    ).rejects.toBeInstanceOf(InvalidPromotionCursorError);
  });

  it('never reaches the repository when the cursor is malformed', async () => {
    repository.seed([promotion('p-1')]);

    await useCase
      .execute({ businessUnitId: 'bu-1', limit: 20, cursor: '!!!' })
      .catch(() => undefined);

    expect(repository.lastInput).toBeNull();
  });

  it('asks the repository to judge the window against the current instant', async () => {
    const before = Date.now();
    repository.seed([]);

    await useCase.execute({ businessUnitId: 'bu-1', limit: 20 });

    const now = repository.lastInput?.now;
    expect(now).toBeInstanceOf(Date);
    expect(now!.getTime()).toBeGreaterThanOrEqual(before);
    expect(now!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('wraps a repository failure in PromotionsFetchError', async () => {
    const cause = new Error('db down');
    repository.failWith(cause);

    await expect(useCase.execute({ businessUnitId: 'bu-1', limit: 20 })).rejects.toThrow(
      PromotionsFetchError,
    );
    await expect(useCase.execute({ businessUnitId: 'bu-1', limit: 20 })).rejects.toMatchObject({
      cause,
    });
  });
});
