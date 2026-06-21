import { beforeEach, describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { FindPromotionByIdUseCase } from './find-promotion-by-id.use-case';
import { Promotion } from '../../domain/entities/promotion.entity';
import { DiscountType } from '../../domain/value-objects/discount-type';
import { PromotionNotFoundError } from '../errors/promotion-not-found.error';
import { PromotionsFetchError } from '../errors/promotions-fetch.error';
import type {
  CreatePromotionInput,
  FindPromotionsByBusinessUnitInput,
  PromotionRepository,
  RecordOrderPromotionInput,
  UpdatePromotionInput,
} from '../../domain/repositories/promotion.repository';

const sample = (): Promotion =>
  new Promotion(
    'promo-1',
    'bu-1',
    'Almoço',
    DiscountType.PERCENTAGE,
    Money.fromDecimalString('10.00'),
    Money.fromDecimalString('30.00'),
    new Date('2026-06-01T00:00:00.000Z'),
    new Date('2026-06-30T00:00:00.000Z'),
    true,
    new Date(),
    new Date(),
  );

class FakePromotionRepository implements PromotionRepository {
  private result: Promotion | null = null;
  private error: Error | null = null;

  seed(promotion: Promotion | null): void {
    this.result = promotion;
  }
  failWith(error: Error): void {
    this.error = error;
  }

  findById(_id: string): Promise<Promotion | null> {
    if (this.error) {
      return Promise.reject(this.error);
    }
    return Promise.resolve(this.result);
  }
  create(_input: CreatePromotionInput): Promise<Promotion> {
    throw new Error('not used');
  }
  findManyByBusinessUnit(_input: FindPromotionsByBusinessUnitInput): Promise<Promotion[]> {
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

describe('FindPromotionByIdUseCase', () => {
  let repo: FakePromotionRepository;
  let useCase: FindPromotionByIdUseCase;

  beforeEach(() => {
    repo = new FakePromotionRepository();
    useCase = new FindPromotionByIdUseCase(repo);
  });

  it('returns the promotion when it exists', async () => {
    repo.seed(sample());

    const promotion = await useCase.execute('promo-1');

    expect(promotion.id).toBe('promo-1');
  });

  it('throws PromotionNotFoundError when missing', async () => {
    repo.seed(null);

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(PromotionNotFoundError);
  });

  it('wraps a repository failure as PromotionsFetchError, chaining the cause', async () => {
    const cause = new Error('db down');
    repo.failWith(cause);

    await expect(useCase.execute('promo-1')).rejects.toBeInstanceOf(PromotionsFetchError);
    await expect(useCase.execute('promo-1')).rejects.toMatchObject({ cause });
  });
});
