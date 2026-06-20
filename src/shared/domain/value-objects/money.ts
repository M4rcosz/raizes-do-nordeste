import Big from 'big.js';
import { InvalidMoneyError } from '@shared/errors/domain/invalid-money.error';

/**
 * Immutable monetary value object wrapping big.js. The internal Big is never
 * exposed so callers cannot bypass the VO and do raw arithmetic. Full precision
 * is kept across operations; rounding happens only at the output borders
 * (toDecimalString, toCents). Construct via the static factories, not new.
 *
 * Money is signed: negatives are allowed on purpose, for deltas, refunds and
 * discounts. The non-negativity rule belongs to the entities that own the
 * amount, not to this VO.
 */
export class Money {
  private readonly value: Big;

  private constructor(value: Big) {
    this.value = value;
  }

  /**
   * Entry border for decimal strings, typically Prisma Decimal.toString(). big.js
   * throws on NaN, empty or malformed input, so we wrap it and rethrow a domain
   * error keeping the original cause.
   */
  static fromDecimalString(amount: string): Money {
    try {
      return new Money(new Big(amount));
    } catch (err) {
      throw new InvalidMoneyError(`Invalid monetary amount: "${amount}".`, {
        cause: err,
      });
    }
  }

  static zero(): Money {
    return new Money(new Big(0));
  }

  /**
   * Builds from an integer number of cents (e.g. 1050 -> 10.50). Rejects non
   * integer or non finite inputs since cents are indivisible here.
   */
  static fromCents(cents: number): Money {
    if (!Number.isInteger(cents)) {
      throw new InvalidMoneyError(`Cents must be a finite integer, received: ${cents}.`);
    }
    return new Money(new Big(cents).div(100));
  }

  plus(other: Money): Money {
    return new Money(this.value.plus(other.value));
  }

  minus(other: Money): Money {
    return new Money(this.value.minus(other.value));
  }

  // Scalar multiply (a quantity or rate), not another Money.
  times(factor: number | string): Money {
    return new Money(this.value.times(factor));
  }

  equals(other: Money): boolean {
    return this.value.eq(other.value);
  }

  greaterThan(other: Money): boolean {
    return this.value.gt(other.value);
  }

  lessThan(other: Money): boolean {
    return this.value.lt(other.value);
  }

  greaterThanOrEqual(other: Money): boolean {
    return this.value.gte(other.value);
  }

  lessThanOrEqual(other: Money): boolean {
    return this.value.lte(other.value);
  }

  isZero(): boolean {
    return this.value.eq(0);
  }

  isNegative(): boolean {
    return this.value.lt(0);
  }

  isPositive(): boolean {
    return this.value.gt(0);
  }

  /**
   * Output border: 2 decimal places, half-up. The rounding mode is passed
   * explicitly so we never depend on the global Big.RM nor mutate it.
   */
  toDecimalString(): string {
    return this.value.toFixed(2, Big.roundHalfUp);
  }

  toCents(): number {
    // number loses precision above MAX_SAFE_INTEGER, so guard before returning.
    const cents = Number(this.value.times(100).round(0, Big.roundHalfUp).toString());
    if (!Number.isSafeInteger(cents)) {
      throw new InvalidMoneyError(
        `Monetary amount too large to represent as integer cents: ${this.toDecimalString()}.`,
      );
    }
    return cents;
  }

  // Lets JSON.stringify serialize Money as its decimal string automatically.
  toJSON(): string {
    return this.toDecimalString();
  }
}
