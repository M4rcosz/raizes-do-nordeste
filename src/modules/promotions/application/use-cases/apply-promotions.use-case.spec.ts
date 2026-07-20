import { beforeEach, describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { ApplyPromotionsUseCase } from './apply-promotions.use-case';
import { Promotion } from '../../domain/entities/promotion.entity';
import { DiscountType } from '../../domain/value-objects/discount-type';
import type {
  CreatePromotionInput,
  FindActivePromotionsInput,
  FindPromotionsByBusinessUnitInput,
  PromotionRepository,
  RecordOrderPromotionInput,
  UpdatePromotionInput,
} from '../../domain/repositories/promotion.repository';

const TX: TransactionContext = Symbol('tx');
const NOW = new Date('2026-06-15T12:00:00.000Z');
const START = new Date('2026-06-01T00:00:00.000Z');
const END = new Date('2026-06-30T00:00:00.000Z');

const promotion = (
  id: string,
  overrides: Partial<{
    discountType: DiscountType;
    discountValue: string;
    minOrderValue: string;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
  }> = {},
): Promotion =>
  new Promotion(
    id,
    'bu-1',
    `promo ${id}`,
    overrides.discountType ?? DiscountType.FIXED_AMOUNT,
    Money.fromDecimalString(overrides.discountValue ?? '5.00'),
    Money.fromDecimalString(overrides.minOrderValue ?? '0.00'),
    overrides.startDate ?? START,
    overrides.endDate ?? END,
    overrides.isActive ?? true,
    new Date(),
    new Date(),
  );

/**
 * In-memory PromotionRepository. findActiveEligible applies the same window+active SQL
 * filter the prisma repo would (the domain still gates subtotal/min). recordOrderPromotion
 * captures what would be inserted so the apply path is exercised, not mocked.
 */
class FakePromotionRepository implements PromotionRepository {
  private readonly store: Promotion[] = [];
  readonly recorded: RecordOrderPromotionInput[] = [];

  seed(...promos: Promotion[]): void {
    this.store.push(...promos);
  }

  create(_input: CreatePromotionInput): Promise<Promotion> {
    throw new Error('not used in this spec');
  }
  findById(_id: string): Promise<Promotion | null> {
    throw new Error('not used in this spec');
  }
  findManyActive(_input: FindActivePromotionsInput): Promise<Promotion[]> {
    throw new Error('not used');
  }
  findManyByBusinessUnit(_input: FindPromotionsByBusinessUnitInput): Promise<Promotion[]> {
    throw new Error('not used in this spec');
  }
  update(_id: string, _input: UpdatePromotionInput): Promise<Promotion> {
    throw new Error('not used in this spec');
  }

  findActiveEligible(businessUnitId: string, now: Date): Promise<Promotion[]> {
    return Promise.resolve(
      this.store.filter(
        (p) =>
          p.businessUnitId === businessUnitId &&
          p.isActive &&
          p.startDate.getTime() <= now.getTime() &&
          p.endDate.getTime() > now.getTime(),
      ),
    );
  }

  recordOrderPromotion(input: RecordOrderPromotionInput): Promise<void> {
    this.recorded.push(input);
    return Promise.resolve();
  }
}

describe('ApplyPromotionsUseCase', () => {
  let repo: FakePromotionRepository;
  let useCase: ApplyPromotionsUseCase;

  beforeEach(() => {
    repo = new FakePromotionRepository();
    useCase = new ApplyPromotionsUseCase(repo);
  });

  describe('quoteDiscount', () => {
    it('returns null when no promotion exists for the unit', async () => {
      const result = await useCase.quoteDiscount(
        { businessUnitId: 'bu-1', subtotal: '50.00', now: NOW },
        TX,
      );
      expect(result).toBeNull();
    });

    it('prices the single eligible promotion', async () => {
      repo.seed(promotion('p-1', { discountValue: '7.00' }));

      const result = await useCase.quoteDiscount(
        { businessUnitId: 'bu-1', subtotal: '50.00', now: NOW },
        TX,
      );

      expect(result).toEqual({ promotionId: 'p-1', discount: '7.00' });
    });

    it('does not write on quote', async () => {
      repo.seed(promotion('p-1', { discountValue: '7.00' }));

      await useCase.quoteDiscount({ businessUnitId: 'bu-1', subtotal: '50.00', now: NOW }, TX);

      expect(repo.recorded).toEqual([]);
    });

    it('skips a promotion below its minimum order value', async () => {
      repo.seed(promotion('p-1', { discountValue: '7.00', minOrderValue: '60.00' }));

      const result = await useCase.quoteDiscount(
        { businessUnitId: 'bu-1', subtotal: '50.00', now: NOW },
        TX,
      );

      expect(result).toBeNull();
    });
  });

  describe('stacking: at most one promotion (the best)', () => {
    it('picks the promotion with the largest discount when several are eligible', async () => {
      repo.seed(
        promotion('p-1', { discountValue: '5.00' }),
        promotion('p-2', { discountValue: '12.00' }),
        promotion('p-3', { discountValue: '8.00' }),
      );

      const result = await useCase.quoteDiscount(
        { businessUnitId: 'bu-1', subtotal: '50.00', now: NOW },
        TX,
      );

      expect(result).toEqual({ promotionId: 'p-2', discount: '12.00' });
    });

    it('breaks a tie deterministically by the smallest id, so quote and apply agree', async () => {
      repo.seed(
        promotion('p-2', { discountValue: '5.00' }),
        promotion('p-1', { discountValue: '5.00' }),
      );

      const quoted = await useCase.quoteDiscount(
        { businessUnitId: 'bu-1', subtotal: '50.00', now: NOW },
        TX,
      );
      const applied = await useCase.applyForOrder(
        { businessUnitId: 'bu-1', orderId: 'o-1', subtotal: '50.00', now: NOW },
        TX,
      );

      expect(quoted).toEqual({ promotionId: 'p-1', discount: '5.00' });
      expect(applied).toEqual({ promotionId: 'p-1', discount: '5.00' });
    });

    it('records exactly one OrderPromotion even with several eligible promotions', async () => {
      repo.seed(
        promotion('p-1', { discountValue: '5.00' }),
        promotion('p-2', { discountValue: '12.00' }),
      );

      await useCase.applyForOrder(
        { businessUnitId: 'bu-1', orderId: 'o-1', subtotal: '50.00', now: NOW },
        TX,
      );

      expect(repo.recorded).toEqual([
        { orderId: 'o-1', promotionId: 'p-2', discountApplied: '12.00' },
      ]);
    });
  });

  describe('applyForOrder', () => {
    it('records the chosen promotion keyed to the order id and returns it', async () => {
      repo.seed(promotion('p-1', { discountValue: '7.00' }));

      const result = await useCase.applyForOrder(
        { businessUnitId: 'bu-1', orderId: 'o-9', subtotal: '50.00', now: NOW },
        TX,
      );

      expect(result).toEqual({ promotionId: 'p-1', discount: '7.00' });
      expect(repo.recorded).toEqual([
        { orderId: 'o-9', promotionId: 'p-1', discountApplied: '7.00' },
      ]);
    });

    it('returns null and records nothing when no promotion applies', async () => {
      const result = await useCase.applyForOrder(
        { businessUnitId: 'bu-1', orderId: 'o-1', subtotal: '50.00', now: NOW },
        TX,
      );

      expect(result).toBeNull();
      expect(repo.recorded).toEqual([]);
    });

    it('quote and apply price the same discount (determinism)', async () => {
      repo.seed(
        promotion('p-1', { discountType: DiscountType.PERCENTAGE, discountValue: '10.00' }),
      );

      const quoted = await useCase.quoteDiscount(
        { businessUnitId: 'bu-1', subtotal: '50.00', now: NOW },
        TX,
      );
      const applied = await useCase.applyForOrder(
        { businessUnitId: 'bu-1', orderId: 'o-1', subtotal: '50.00', now: NOW },
        TX,
      );

      expect(quoted).toEqual(applied);
      expect(quoted).toEqual({ promotionId: 'p-1', discount: '5.00' });
    });
  });
});
