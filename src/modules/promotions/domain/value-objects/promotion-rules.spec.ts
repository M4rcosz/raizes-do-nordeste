import { describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { type EligibilityInput, isEligible } from './promotion-rules';

const START = new Date('2026-06-01T00:00:00.000Z');
const END = new Date('2026-06-30T00:00:00.000Z');

const base = (overrides: Partial<EligibilityInput> = {}): EligibilityInput => ({
  now: new Date('2026-06-15T12:00:00.000Z'),
  subtotal: Money.fromDecimalString('50.00'),
  isActive: true,
  startDate: START,
  endDate: END,
  minOrderValue: Money.fromDecimalString('30.00'),
  ...overrides,
});

describe('isEligible', () => {
  it('is eligible inside the window, active, and at or above the minimum', () => {
    expect(isEligible(base())).toBe(true);
  });

  it('is not eligible when inactive', () => {
    expect(isEligible(base({ isActive: false }))).toBe(false);
  });

  describe('date window [startDate, endDate)', () => {
    it('is eligible exactly at startDate (left edge inclusive)', () => {
      expect(isEligible(base({ now: new Date(START) }))).toBe(true);
    });

    it('is not eligible one millisecond before startDate', () => {
      expect(isEligible(base({ now: new Date(START.getTime() - 1) }))).toBe(false);
    });

    it('is not eligible exactly at endDate (right edge exclusive)', () => {
      expect(isEligible(base({ now: new Date(END) }))).toBe(false);
    });

    it('is eligible one millisecond before endDate', () => {
      expect(isEligible(base({ now: new Date(END.getTime() - 1) }))).toBe(true);
    });
  });

  describe('minimum order value', () => {
    it('is eligible when the subtotal equals the minimum (inclusive)', () => {
      expect(isEligible(base({ subtotal: Money.fromDecimalString('30.00') }))).toBe(true);
    });

    it('is not eligible when the subtotal is one cent below the minimum', () => {
      expect(isEligible(base({ subtotal: Money.fromDecimalString('29.99') }))).toBe(false);
    });

    it('is eligible with a zero minimum and any positive subtotal', () => {
      expect(
        isEligible(
          base({
            minOrderValue: Money.zero(),
            subtotal: Money.fromDecimalString('0.01'),
          }),
        ),
      ).toBe(true);
    });
  });
});
