import { Money } from '@shared/domain/value-objects/money';
import { FreeItemNotSupportedError } from '../errors/free-item-not-supported.error';

/**
 * Mirrors the Prisma DiscountType enum. Kept as a plain const object (not a TS enum)
 * to match the project's VO style and stay structurally compatible with the persisted
 * string values.
 */
export const DiscountType = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED_AMOUNT: 'FIXED_AMOUNT',
  FREE_ITEM: 'FREE_ITEM',
} as const;

export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];

/**
 * Policy that prices a discount from its type and configured value, never with raw
 * arithmetic. The discount is clamped to [0, subtotal] here too: a discount can never
 * exceed the order it sits on, and the order's own band check is the net backstop.
 *
 * FREE_ITEM is out of MVP scope: the schema does not model the target item, so there
 * is no way to price it deterministically. It rejects with a domain error instead of
 * silently pricing zero, so a misconfigured promotion is loud, not invisible.
 */
export function computeDiscount(type: DiscountType, subtotal: Money, discountValue: Money): Money {
  switch (type) {
    case DiscountType.PERCENTAGE: {
      // discountValue is a percentage like "10.00" meaning 10%. Multiply the subtotal
      // by value/100, then cap at the subtotal so 100%+ never overshoots.
      const raw = subtotal.times(discountValue.toDecimalString()).times('0.01');
      return raw.greaterThan(subtotal) ? subtotal : raw;
    }
    case DiscountType.FIXED_AMOUNT: {
      // A fixed amount may exceed a small order: cap it at the subtotal.
      return discountValue.greaterThan(subtotal) ? subtotal : discountValue;
    }
    case DiscountType.FREE_ITEM:
      throw new FreeItemNotSupportedError(
        'FREE_ITEM promotions are not supported: the schema does not model a target item.',
      );
    default: {
      // Compile-time exhaustiveness: a new DiscountType must be handled above.
      const _exhaustive: never = type;
      throw new Error(`Unhandled discount type ${String(_exhaustive)}.`);
    }
  }
}
