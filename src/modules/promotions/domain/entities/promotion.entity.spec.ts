import { describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { Promotion } from './promotion.entity';
import { DiscountType } from '../value-objects/discount-type';
import { FreeItemNotSupportedError } from '../errors/free-item-not-supported.error';

const START = new Date('2026-06-01T00:00:00.000Z');
const END = new Date('2026-06-30T00:00:00.000Z');
const NOW = new Date('2026-06-15T12:00:00.000Z');

const build = (
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
    'promo-1',
    'bu-1',
    'Almoço executivo',
    overrides.discountType ?? DiscountType.PERCENTAGE,
    Money.fromDecimalString(overrides.discountValue ?? '10.00'),
    Money.fromDecimalString(overrides.minOrderValue ?? '30.00'),
    overrides.startDate ?? START,
    overrides.endDate ?? END,
    overrides.isActive ?? true,
    new Date('2026-05-01T00:00:00.000Z'),
    new Date('2026-05-01T00:00:00.000Z'),
  );

describe('Promotion', () => {
  describe('quoteDiscount', () => {
    it('prices an eligible PERCENTAGE promotion (10% of 50.00 = 5.00)', () => {
      const discount = build().quoteDiscount(Money.fromDecimalString('50.00'), NOW);
      expect(discount.toDecimalString()).toBe('5.00');
    });

    it('prices an eligible FIXED_AMOUNT promotion', () => {
      const discount = build({
        discountType: DiscountType.FIXED_AMOUNT,
        discountValue: '8.00',
      }).quoteDiscount(Money.fromDecimalString('50.00'), NOW);
      expect(discount.toDecimalString()).toBe('8.00');
    });

    it('returns zero when inactive', () => {
      const discount = build({ isActive: false }).quoteDiscount(
        Money.fromDecimalString('50.00'),
        NOW,
      );
      expect(discount.isZero()).toBe(true);
    });

    it('returns zero when below the minimum order value', () => {
      const discount = build({ minOrderValue: '60.00' }).quoteDiscount(
        Money.fromDecimalString('50.00'),
        NOW,
      );
      expect(discount.isZero()).toBe(true);
    });

    it('returns zero outside the date window (at endDate, exclusive)', () => {
      const discount = build().quoteDiscount(Money.fromDecimalString('50.00'), new Date(END));
      expect(discount.isZero()).toBe(true);
    });

    it('still throws FreeItemNotSupportedError for an eligible FREE_ITEM promotion', () => {
      // Eligibility passes but pricing is unsupported: loud misconfiguration, not a quiet 0.
      const promotion = build({ discountType: DiscountType.FREE_ITEM });
      expect(() => promotion.quoteDiscount(Money.fromDecimalString('50.00'), NOW)).toThrow(
        FreeItemNotSupportedError,
      );
    });

    it('is deterministic for the same subtotal and instant', () => {
      const promotion = build();
      const a = promotion.quoteDiscount(Money.fromDecimalString('50.00'), NOW);
      const b = promotion.quoteDiscount(Money.fromDecimalString('50.00'), NOW);
      expect(a.equals(b)).toBe(true);
    });
  });

  describe('isEligibleFor', () => {
    it('is true inside the window, active and above the minimum', () => {
      expect(build().isEligibleFor(Money.fromDecimalString('50.00'), NOW)).toBe(true);
    });

    it('is false below the minimum', () => {
      expect(build().isEligibleFor(Money.fromDecimalString('10.00'), NOW)).toBe(false);
    });
  });
});
