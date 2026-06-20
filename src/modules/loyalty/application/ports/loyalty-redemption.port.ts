import type { TransactionContext } from '@shared/transaction/transaction-runner.port';

export const LOYALTY_REDEMPTION = Symbol('LoyaltyRedemption');

export interface QuoteDiscountInput {
  customerId: string;
  /** Points the customer asked to spend; always positive when this port is called. */
  points: number;
  /** Gross items subtotal as a decimal string: the redeem discount may not exceed it. */
  subtotal: string;
}

export interface RedeemForOrderInput {
  customerId: string;
  orderId: string;
  /** Points the customer asked to spend; always positive when this port is called. */
  points: number;
  /** Gross items subtotal as a decimal string: the redeem discount may not exceed it. */
  subtotal: string;
}

/**
 * Capability published by the loyalty context for the orders context to consume.
 * Orders never touches the loyalty domain directly - the points-to-money rate and
 * every redemption rule live behind this port.
 *
 * Two-step because the order id is DB-generated: the order needs its authoritative
 * (discounted) total before insert, but the REDEEM transaction row needs the order
 * id. So `quoteDiscount` validates and prices the redemption (read-only) to set the
 * total, then `redeemForOrder` debits once the id exists. Both run inside the
 * order-creation transaction; the deterministic discount cannot drift between them.
 * Unlike EARN, redemption is not best-effort: insufficient balance, a non-eligible
 * account or a concurrent debit must fail the order, not be swallowed.
 */
export interface LoyaltyRedemption {
  /** Validates eligibility/balance/ceiling and returns the discount as a decimal string. No write. */
  quoteDiscount(input: QuoteDiscountInput, tx: TransactionContext): Promise<string>;
  /** Debits the points (REDEEM + balance decrement) keyed to the order; returns the discount. */
  redeemForOrder(input: RedeemForOrderInput, tx: TransactionContext): Promise<string>;
}
