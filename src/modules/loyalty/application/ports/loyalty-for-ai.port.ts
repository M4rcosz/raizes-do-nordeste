export const LOYALTY_FOR_AI = Symbol('LoyaltyForAi');

/** Read-only loyalty snapshot the assistant may show a customer about their own account. */
export interface LoyaltyForAiView {
  pointsBalance: number;
  hasConsent: boolean;
  enrolledAt: string;
}

/**
 * Capability the loyalty context publishes for the ai context. The caller passes
 * the acting customer's own id; there is no cross-customer lookup here.
 */
export interface LoyaltyForAi {
  /** Returns null when the customer has no loyalty account yet. */
  getForCustomer(customerId: string): Promise<LoyaltyForAiView | null>;
}
