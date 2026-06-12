import Big from 'big.js';
import { canTransition, type OrderStatus } from '../value-objects/order-status';
import type { OrderChannel } from '../value-objects/order-channel';
import { OrderItem } from './order-item.entity';
import { InvalidOrderStatusTransitionError } from '../errors/invalid-order-status-transition.error';
import { InvalidOrderTotalError } from '../errors/invalid-order-total.error';

export class Order {
  /** Gross sum of the line subtotals, before any discount. */
  public readonly itemsSubtotal: Big;
  /** Amount knocked off the gross subtotal (itemsSubtotal - totalAmount); 0 when nothing was discounted. */
  public readonly discountAmount: Big;

  constructor(
    public readonly id: string,
    public readonly businessUnitId: string,
    public readonly customerId: string | null,
    public readonly attendantId: string | null,
    public readonly pointsRedeemed: number,
    public readonly pointsEarned: number,
    /** Authoritative amount charged, net of discount. Supplied by persistence, never recomputed here. */
    public readonly totalAmount: Big,
    public readonly notes: string | null,
    public readonly orderChannel: OrderChannel,
    public readonly orderStatus: OrderStatus,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly updatedById: string | null,
    public readonly orderItems: OrderItem[],
  ) {
    this.itemsSubtotal = Order.calculateItemsSubtotal(orderItems.map((i) => i.subtotal));
    this.discountAmount = this.itemsSubtotal.minus(totalAmount);
    // Reject a persisted total that breaks the discount band (corrupt data guard).
    Order.assertDiscountWithinBand(this.discountAmount, this.itemsSubtotal);
  }

  /** Sums the line subtotals into the gross amount, before any discount. */
  static calculateItemsSubtotal(subtotals: ReadonlyArray<Big | string>): Big {
    return subtotals.reduce<Big>((acc, curr) => acc.plus(new Big(curr)), new Big(0));
  }

  /**
   * The discount rule: the charged total is the gross subtotal minus the discount.
   * The discount must sit in [0, subtotal] - never negative (a surcharge) nor larger
   * than the subtotal. Throws {@link InvalidOrderTotalError} otherwise. Callers pass 0
   * today; the loyalty module will supply the points-based discount.
   */
  static computeTotal(itemsSubtotal: Big, discountAmount: Big): Big {
    Order.assertDiscountWithinBand(discountAmount, itemsSubtotal);
    return itemsSubtotal.minus(discountAmount);
  }

  private static assertDiscountWithinBand(discountAmount: Big, itemsSubtotal: Big): void {
    if (discountAmount.lt(0) || discountAmount.gt(itemsSubtotal)) {
      throw new InvalidOrderTotalError(
        `Discount ${discountAmount.toFixed(2)} is outside the allowed range [0, ${itemsSubtotal.toFixed(
          2,
        )}].`,
      );
    }
  }

  /**
   * Guards a status change against the order state machine. Throws
   * {@link InvalidOrderStatusTransitionError} when the move is not allowed.
   * The order is immutable: persisting the new status is the repository's job.
   */
  assertCanTransitionTo(target: OrderStatus): void {
    if (!canTransition(this.orderStatus, target)) {
      throw new InvalidOrderStatusTransitionError(
        `Cannot change order ${this.id} from ${this.orderStatus} to ${target}.`,
      );
    }
  }
}
