export const LOYALTY_ENROLLMENT = Symbol('LoyaltyEnrollment');

/**
 * Capability published by the loyalty context for the orders context to consume.
 * Called best-effort after an order commits: a failure here must never undo or
 * block the order, so the caller catches and logs instead of propagating.
 */
export interface LoyaltyEnrollment {
  /** Creates the customer's account on their first order; later calls are no-ops. */
  ensureAccount(customerId: string): Promise<void>;
}
