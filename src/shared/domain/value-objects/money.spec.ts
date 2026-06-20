import { describe, expect, it } from '@jest/globals';
import { InvalidMoneyError } from '@shared/errors/domain/invalid-money.error';
import { Money } from './money';

describe('Money', () => {
  describe('creation', () => {
    it('builds from a valid decimal string', () => {
      expect(Money.fromDecimalString('10.50').toDecimalString()).toBe('10.50');
    });

    it('zero() is 0.00', () => {
      expect(Money.zero().toDecimalString()).toBe('0.00');
    });

    it('builds from integer cents', () => {
      expect(Money.fromCents(1050).toDecimalString()).toBe('10.50');
    });
  });

  describe('invalid creation', () => {
    it.each(['abc', '', 'NaN'])('throws InvalidMoneyError for "%s"', (input) => {
      expect(() => Money.fromDecimalString(input)).toThrow(InvalidMoneyError);
    });

    it('preserves the original big.js error as cause', () => {
      expect.assertions(2);
      try {
        Money.fromDecimalString('abc');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidMoneyError);
        expect((err as InvalidMoneyError).cause).toBeInstanceOf(Error);
      }
    });

    it.each([10.5, NaN, Infinity, -Infinity])(
      'throws InvalidMoneyError for non-integer cents %p',
      (cents) => {
        expect(() => Money.fromCents(cents)).toThrow(InvalidMoneyError);
      },
    );
  });

  describe('equality', () => {
    it('treats 10.00 and 10 as equal', () => {
      expect(Money.fromDecimalString('10.00').equals(Money.fromDecimalString('10'))).toBe(true);
    });

    it('treats 10.00 and 10.01 as different', () => {
      expect(Money.fromDecimalString('10.00').equals(Money.fromDecimalString('10.01'))).toBe(false);
    });
  });

  describe('arithmetic', () => {
    it('adds', () => {
      expect(
        Money.fromDecimalString('10.50').plus(Money.fromDecimalString('0.25')).toDecimalString(),
      ).toBe('10.75');
    });

    it('subtracts', () => {
      expect(
        Money.fromDecimalString('10').minus(Money.fromDecimalString('3.50')).toDecimalString(),
      ).toBe('6.50');
    });

    it('multiplies by a number scalar', () => {
      expect(Money.fromDecimalString('10').times(3).toDecimalString()).toBe('30.00');
    });

    it('multiplies by a string scalar', () => {
      expect(Money.fromDecimalString('10.10').times('2').toDecimalString()).toBe('20.20');
    });

    it('keeps operands immutable', () => {
      const a = Money.fromDecimalString('10.50');
      const b = Money.fromDecimalString('0.25');
      a.plus(b);
      expect(a.toDecimalString()).toBe('10.50');
      expect(b.toDecimalString()).toBe('0.25');
    });
  });

  describe('rounding on output', () => {
    it('rounds half-up to 2 places only at the border', () => {
      // 10 * 0.333 = 3.33 (full precision kept, rounded only here)
      expect(Money.fromDecimalString('10').times('0.333').toDecimalString()).toBe('3.33');
    });

    it('rounds half-up away from zero on negatives', () => {
      // big.js roundHalfUp rounds away from zero on ties, so -3.335 -> -3.34.
      expect(Money.fromDecimalString('-3.335').toDecimalString()).toBe('-3.34');
    });

    it('keeps internal precision across chained ops', () => {
      // 10 * 0.333 = 3.33 exactly, + 0.005 = 3.335 (not truncated mid-chain),
      // which only rounds up to 3.34 if the 0.005 survived; proves no early cut.
      const result = Money.fromDecimalString('10')
        .times('0.333')
        .plus(Money.fromDecimalString('0.005'));
      expect(result.toDecimalString()).toBe('3.34');
    });
  });

  describe('zero', () => {
    it('zero() isZero', () => {
      expect(Money.zero().isZero()).toBe(true);
    });

    it('0.00 isZero', () => {
      expect(Money.fromDecimalString('0.00').isZero()).toBe(true);
    });
  });

  describe('negatives', () => {
    it('5 - 8 is negative', () => {
      const result = Money.fromDecimalString('5').minus(Money.fromDecimalString('8'));
      expect(result.isNegative()).toBe(true);
      expect(result.toDecimalString()).toBe('-3.00');
    });
  });

  describe('comparisons', () => {
    const five = Money.fromDecimalString('5');
    const ten = Money.fromDecimalString('10');
    const alsoTen = Money.fromDecimalString('10.00');

    it('greaterThan', () => {
      expect(ten.greaterThan(five)).toBe(true);
      expect(five.greaterThan(ten)).toBe(false);
      expect(ten.greaterThan(alsoTen)).toBe(false);
    });

    it('lessThan', () => {
      expect(five.lessThan(ten)).toBe(true);
      expect(ten.lessThan(five)).toBe(false);
      expect(ten.lessThan(alsoTen)).toBe(false);
    });

    it('greaterThanOrEqual', () => {
      expect(ten.greaterThanOrEqual(alsoTen)).toBe(true);
      expect(ten.greaterThanOrEqual(five)).toBe(true);
      expect(five.greaterThanOrEqual(ten)).toBe(false);
    });

    it('lessThanOrEqual', () => {
      expect(ten.lessThanOrEqual(alsoTen)).toBe(true);
      expect(five.lessThanOrEqual(ten)).toBe(true);
      expect(ten.lessThanOrEqual(five)).toBe(false);
    });

    it('isPositive', () => {
      expect(five.isPositive()).toBe(true);
      expect(Money.zero().isPositive()).toBe(false);
    });
  });

  describe('serialization', () => {
    it('JSON.stringify uses the decimal string', () => {
      expect(JSON.stringify({ price: Money.fromDecimalString('12.5') })).toBe('{"price":"12.50"}');
    });
  });

  describe('toCents', () => {
    it('returns the integer cents', () => {
      expect(Money.fromDecimalString('10.50').toCents()).toBe(1050);
    });

    it('rounds half-up to integer cents', () => {
      // 10.505 -> 1050.5 -> 1051 (away from zero on the tie).
      expect(Money.fromDecimalString('10.505').toCents()).toBe(1051);
    });

    it('keeps the sign on negatives', () => {
      expect(Money.fromDecimalString('-10.50').toCents()).toBe(-1050);
    });

    it('throws when cents overflow MAX_SAFE_INTEGER', () => {
      // 99999999999999999 * 100 cents is far above Number.MAX_SAFE_INTEGER,
      // where number can no longer represent every integer exactly.
      expect(() => Money.fromDecimalString('99999999999999999').toCents()).toThrow(
        InvalidMoneyError,
      );
    });
  });
});
