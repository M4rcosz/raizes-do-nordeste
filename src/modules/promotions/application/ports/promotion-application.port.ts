import type { TransactionContext } from '@shared/transaction/transaction-runner.port';

export const PROMOTION_APPLICATION = Symbol('PromotionApplication');

export interface QuotePromotionInput {
  businessUnitId: string;
  /** Gross items subtotal as a decimal string: promotions price against this. */
  subtotal: string;
  /** Moment to evaluate the date window against; the order-creation time. */
  now: Date;
}

export interface ApplyPromotionInput {
  businessUnitId: string;
  orderId: string;
  /** Gross items subtotal as a decimal string: promotions price against this. */
  subtotal: string;
  /** Moment to evaluate the date window against; same instant the quote used. */
  now: Date;
}

/** The promotion chosen and the discount it priced, or null when none applies. */
export interface AppliedPromotion {
  promotionId: string;
  /** Discount this promotion grants for the order as a 2dp decimal string. */
  discount: string;
}

/**
 * Capability published by the promotions context for the orders context to consume.
 * Orders never touches the promotions domain directly - stacking rules, eligibility
 * and the per-type pricing all live behind this port.
 *
 * Two-step, like loyalty redemption, because the order id is DB-generated: the order
 * needs its discounted total before insert, but the OrderPromotion row needs the order
 * id. So `quoteDiscount` selects and prices the promotion (read-only) to set the total,
 * then `applyForOrder` records the OrderPromotion once the id exists. Both run inside
 * the order-creation transaction; the selection is deterministic so quote and apply
 * cannot diverge. Returns null when no promotion is eligible (not an error - most
 * orders have none).
 */
export interface PromotionApplication {
  /** Picks and prices the best eligible promotion. No write. Null when none applies. */
  quoteDiscount(
    input: QuotePromotionInput,
    tx: TransactionContext,
  ): Promise<AppliedPromotion | null>;
  /** Re-selects deterministically and writes the OrderPromotion keyed to the order. */
  applyForOrder(
    input: ApplyPromotionInput,
    tx: TransactionContext,
  ): Promise<AppliedPromotion | null>;
}
