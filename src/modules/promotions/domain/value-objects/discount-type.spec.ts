import { describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { computeDiscount, DiscountType } from './discount-type';
import { FreeItemNotSupportedError } from '../errors/free-item-not-supported.error';

const money = (v: string): Money => Money.fromDecimalString(v);

describe('computeDiscount', () => {
  describe('PERCENTAGE', () => {
    it('prices a percentage of the subtotal (10% of 50.00 = 5.00)', () => {
      const discount = computeDiscount(DiscountType.PERCENTAGE, money('50.00'), money('10.00'));
      expect(discount.toDecimalString()).toBe('5.00');
    });

    it('handles a fractional percentage with full precision before the 2dp border', () => {
      // 7.5% of 33.33 = 2.49975 -> rounds half-up to 2.50 at the output border.
      const discount = computeDiscount(DiscountType.PERCENTAGE, money('33.33'), money('7.5'));
      expect(discount.toDecimalString()).toBe('2.50');
    });

    it('caps a 100% discount at the subtotal', () => {
      const discount = computeDiscount(DiscountType.PERCENTAGE, money('50.00'), money('100.00'));
      expect(discount.toDecimalString()).toBe('50.00');
    });

    it('caps an over-100% discount at the subtotal (never negative total)', () => {
      const discount = computeDiscount(DiscountType.PERCENTAGE, money('50.00'), money('150.00'));
      expect(discount.toDecimalString()).toBe('50.00');
    });

    it('is zero when the subtotal is zero', () => {
      const discount = computeDiscount(DiscountType.PERCENTAGE, money('0.00'), money('10.00'));
      expect(discount.toDecimalString()).toBe('0.00');
    });
  });

  describe('FIXED_AMOUNT', () => {
    it('prices the fixed value when it is below the subtotal', () => {
      const discount = computeDiscount(DiscountType.FIXED_AMOUNT, money('50.00'), money('15.00'));
      expect(discount.toDecimalString()).toBe('15.00');
    });

    it('caps the fixed value at the subtotal when it would overshoot', () => {
      const discount = computeDiscount(DiscountType.FIXED_AMOUNT, money('10.00'), money('15.00'));
      expect(discount.toDecimalString()).toBe('10.00');
    });

    it('returns the full fixed value when it equals the subtotal', () => {
      const discount = computeDiscount(DiscountType.FIXED_AMOUNT, money('15.00'), money('15.00'));
      expect(discount.toDecimalString()).toBe('15.00');
    });
  });

  describe('FREE_ITEM', () => {
    it('rejects with FreeItemNotSupportedError (out of MVP scope)', () => {
      expect(() => computeDiscount(DiscountType.FREE_ITEM, money('50.00'), money('0.00'))).toThrow(
        FreeItemNotSupportedError,
      );
    });
  });
});
