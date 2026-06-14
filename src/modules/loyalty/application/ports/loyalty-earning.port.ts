import type { TransactionContext } from '@shared/transaction/transaction-runner.port';

export const LOYALTY_EARNING = Symbol('LoyaltyEarning');

export interface EarnForOrderInput {
  customerId: string;
  orderId: string;
  /** The amount actually charged, as a decimal string (money is never a JS number). */
  totalAmount: string;
}

/**
 * Capability published by the loyalty context for the payments context to consume.
 * Runs inside the payment's settlement transaction so settle + order confirm +
 * points credit land (or roll back) together. No account or no consent = no-op.
 */
export interface LoyaltyEarning {
  earnForOrder(input: EarnForOrderInput, tx: TransactionContext): Promise<void>;
}
