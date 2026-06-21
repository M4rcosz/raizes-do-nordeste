import { Money } from '@shared/domain/value-objects/money';
import { computeDiscount, DiscountType } from '../value-objects/discount-type';
import { isEligible } from '../value-objects/promotion-rules';

export class Promotion {
  constructor(
    public readonly id: string,
    public readonly businessUnitId: string,
    public readonly name: string,
    public readonly discountType: DiscountType,
    public readonly discountValue: Money,
    public readonly minOrderValue: Money,
    public readonly startDate: Date,
    public readonly endDate: Date,
    public readonly isActive: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  /**
   * Prices this promotion's discount for an order subtotal at a point in time. Returns
   * Money.zero when the promotion is not eligible (inactive, out of window, below the
   * minimum) so the apply use case can rank candidates without exceptions on the hot
   * path. A FREE_ITEM promotion still throws via computeDiscount: that is a
   * misconfiguration, not a quiet "no discount".
   *
   * Deterministic for a fixed (subtotal, now): the quote and the apply pass agree.
   */
  quoteDiscount(subtotal: Money, now: Date): Money {
    const eligible = isEligible({
      now,
      subtotal,
      isActive: this.isActive,
      startDate: this.startDate,
      endDate: this.endDate,
      minOrderValue: this.minOrderValue,
    });
    if (!eligible) {
      return Money.zero();
    }
    return computeDiscount(this.discountType, subtotal, this.discountValue);
  }

  /** Same predicate as quoteDiscount's gate, exposed for callers that only need the boolean. */
  isEligibleFor(subtotal: Money, now: Date): boolean {
    return isEligible({
      now,
      subtotal,
      isActive: this.isActive,
      startDate: this.startDate,
      endDate: this.endDate,
      minOrderValue: this.minOrderValue,
    });
  }
}
