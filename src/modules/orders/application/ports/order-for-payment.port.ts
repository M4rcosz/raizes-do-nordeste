import type { TransactionContext } from '@shared/transaction/transaction-runner.port';

export const ORDER_FOR_PAYMENT = Symbol('OrderForPayment');

/** The slice of an order the payments context needs - never the Order entity itself. */
export interface OrderForPaymentView {
  id: string;
  /** True when the order is still PENDING and may be paid. Keeps the orders status taxonomy out of payments. */
  isAwaitingPayment: boolean;
  /** Authoritative amount to charge, as a decimal string (money is never a JS number). */
  totalAmount: string;
  customerId: string | null;
}

/**
 * Result of trying to confirm an order after an approved payment. `not_confirmed` means
 * the order had already moved on (cancelled/deleted): the payment still settles and the
 * caller records the mismatch for reconciliation instead of rolling the money back.
 */
export type OrderConfirmOutcome = 'confirmed' | 'not_confirmed';

/**
 * Capability published by the orders context for the payments context to consume.
 * Payments depends on this interface only; it never imports the Order entity or
 * repository, keeping the cross-context coupling to a single published port.
 */
export interface OrderForPayment {
  findForPayment(orderId: string): Promise<OrderForPaymentView | null>;
  /**
   * Advances the order to CONFIRMED after an approved payment. Reuses the order state
   * machine and optimistic lock; pass the caller's `tx` so the order write shares the
   * payment's transaction. Never throws on a lost optimistic lock - returns the outcome.
   */
  confirmAfterPayment(orderId: string, tx?: TransactionContext): Promise<OrderConfirmOutcome>;
}
