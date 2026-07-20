import { beforeEach, describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { ListPromotionsUseCase } from './list-promotions.use-case';
import { Promotion } from '../../domain/entities/promotion.entity';
import { DiscountType } from '../../domain/value-objects/discount-type';
import { PromotionsFetchError } from '../errors/promotions-fetch.error';
import type {
  CreatePromotionInput,
  FindActivePromotionsInput,
  FindPromotionsByBusinessUnitInput,
  PromotionRepository,
  RecordOrderPromotionInput,
  UpdatePromotionInput,
} from '../../domain/repositories/promotion.repository';

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
    new Date(),
    new Date(),
  );

class FakePromotionRepository implements PromotionRepository {
  private rows: Promotion[] = [];
  private error: Error | null = null;
  lastInput: FindPromotionsByBusinessUnitInput | null = null;

  seed(rows: Promotion[]): void {
    this.rows = rows;
  }
  failWith(error: Error): void {
    this.error = error;
  }

  findManyActive(_input: FindActivePromotionsInput): Promise<Promotion[]> {
    throw new Error('not used');
  }

  findManyByBusinessUnit(input: FindPromotionsByBusinessUnitInput): Promise<Promotion[]> {
    this.lastInput = input;
    if (this.error) {
      return Promise.reject(this.error);
    }
    // Honor the over-fetch take so the use case can detect a next page.
    return Promise.resolve(this.rows.slice(0, input.pagination.take));
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

describe('ListPromotionsUseCase', () => {
  let repo: FakePromotionRepository;
  let useCase: ListPromotionsUseCase;

  beforeEach(() => {
    repo = new FakePromotionRepository();
    useCase = new ListPromotionsUseCase(repo);
  });

  it('over-fetches by one and reports no next page when the result fits the limit', async () => {
    repo.seed([promotion('p-1'), promotion('p-2')]);

    const result = await useCase.execute({ businessUnitId: 'bu-1', limit: 5 });

    expect(repo.lastInput?.pagination.take).toBe(6);
    expect(result.data).toHaveLength(2);
    expect(result.meta).toEqual({ limit: 5, hasMore: false, nextCursor: null });
  });

  it('trims the extra row and sets nextCursor to the last visible id when there is more', async () => {
    repo.seed([promotion('p-1'), promotion('p-2'), promotion('p-3')]);

    const result = await useCase.execute({ businessUnitId: 'bu-1', limit: 2 });

    expect(result.data).toHaveLength(2);
    expect(result.meta).toEqual({ limit: 2, hasMore: true, nextCursor: 'p-2' });
  });

  it('forwards the cursor to the repository', async () => {
    repo.seed([]);

    await useCase.execute({ businessUnitId: 'bu-1', limit: 5, cursor: 'p-9' });

    expect(repo.lastInput?.pagination.cursor).toBe('p-9');
  });

  it('wraps a repository failure as PromotionsFetchError', async () => {
    repo.failWith(new Error('db down'));

    await expect(useCase.execute({ businessUnitId: 'bu-1', limit: 5 })).rejects.toBeInstanceOf(
      PromotionsFetchError,
    );
  });
});
