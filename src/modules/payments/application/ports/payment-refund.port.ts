export const PAYMENT_REFUND = Symbol('PaymentRefund');

/**
 * Result of attempting to refund an order's payment:
 * - `refunded`: an approved payment was reversed at the gateway and marked REFUNDED.
 * - `no-payment`: nothing settled to refund (unpaid order or no approved attempt).
 * - `failed`: the gateway refund failed; the payment is flagged for reconciliation.
 */
export type RefundOutcome = 'refunded' | 'no-payment' | 'failed';

/**
 * Capability published by the payments context for the orders context to consume when an
 * order is cancelled. The orders flow always cancels regardless of the outcome - a
 * `failed` refund becomes an operational reconciliation, never a blocked cancellation.
 */
export interface PaymentRefund {
  refundForOrder(orderId: string): Promise<RefundOutcome>;
}
