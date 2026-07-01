import type { TransactionContext } from '@shared/transaction/transaction-runner.port';

export const LOYALTY_REVERSAL = Symbol('LoyaltyReversal');

export interface ReverseForOrderInput {
  customerId: string;
  orderId: string;
  /** Points granted for this order (only when it was paid); clawed back. */
  pointsEarned: number;
  /** Points the customer spent on this order; refunded. */
  pointsRedeemed: number;
}

/**
 * Capability published by the loyalty context for the orders context to consume when an
 * order is cancelled. Refunds the points the customer spent (credit) and claws back the
 * points the order granted (debit), as signed ADJUSTMENT movements. Runs inside the
 * cancellation transaction so the reversal commits with the order's other compensations.
 */
export interface LoyaltyReversal {
  reverseForOrder(input: ReverseForOrderInput, tx: TransactionContext): Promise<void>;
}
