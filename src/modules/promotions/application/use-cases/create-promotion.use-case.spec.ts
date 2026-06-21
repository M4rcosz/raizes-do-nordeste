import { beforeEach, describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { CreatePromotionUseCase } from './create-promotion.use-case';
import { Promotion } from '../../domain/entities/promotion.entity';
import { DiscountType } from '../../domain/value-objects/discount-type';
import { PromotionNotEligibleError } from '../../domain/errors/promotion-not-eligible.error';
import type {
  CreatePromotionInput,
  FindPromotionsByBusinessUnitInput,
  PromotionRepository,
  RecordOrderPromotionInput,
  UpdatePromotionInput,
} from '../../domain/repositories/promotion.repository';

class FakePromotionRepository implements PromotionRepository {
  readonly created: CreatePromotionInput[] = [];

  create(input: CreatePromotionInput): Promise<Promotion> {
    this.created.push(input);
    return Promise.resolve(
      new Promotion(
        'promo-new',
        input.businessUnitId,
        input.name,
        input.discountType,
        Money.fromDecimalString(input.discountValue),
        Money.fromDecimalString(input.minOrderValue),
        input.startDate,
        input.endDate,
        input.isActive ?? true,
        new Date(),
        new Date(),
      ),
    );
  }
  findById(_id: string): Promise<Promotion | null> {
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

const input = (overrides: Partial<CreatePromotionInput> = {}): CreatePromotionInput => ({
  businessUnitId: 'bu-1',
  name: 'Almoço',
  discountType: DiscountType.PERCENTAGE,
  discountValue: '10.00',
  minOrderValue: '30.00',
  startDate: new Date('2026-06-01T00:00:00.000Z'),
  endDate: new Date('2026-06-30T00:00:00.000Z'),
  ...overrides,
});

describe('CreatePromotionUseCase', () => {
  let repo: FakePromotionRepository;
  let useCase: CreatePromotionUseCase;

  beforeEach(() => {
    repo = new FakePromotionRepository();
    useCase = new CreatePromotionUseCase(repo);
  });

  it('persists a valid promotion and returns the created entity', async () => {
    const promotion = await useCase.execute(input());

    expect(repo.created).toHaveLength(1);
    expect(promotion).toBeInstanceOf(Promotion);
    expect(promotion.id).toBe('promo-new');
    expect(promotion.discountValue.toDecimalString()).toBe('10.00');
  });

  it('rejects when endDate is before startDate (dead window) and never persists', async () => {
    await expect(
      useCase.execute(
        input({
          startDate: new Date('2026-06-30T00:00:00.000Z'),
          endDate: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ),
    ).rejects.toBeInstanceOf(PromotionNotEligibleError);
    expect(repo.created).toEqual([]);
  });

  it('rejects when endDate equals startDate (empty window)', async () => {
    const sameInstant = new Date('2026-06-01T00:00:00.000Z');
    await expect(
      useCase.execute(input({ startDate: sameInstant, endDate: new Date(sameInstant) })),
    ).rejects.toBeInstanceOf(PromotionNotEligibleError);
    expect(repo.created).toEqual([]);
  });
});
