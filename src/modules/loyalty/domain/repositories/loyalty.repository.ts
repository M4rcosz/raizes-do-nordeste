import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { LoyaltyAccount } from '../entities/loyalty-account.entity';

export interface EarnPointsInput {
  loyaltyAccountId: string;
  orderId: string;
  /** Points to credit; always positive. */
  points: number;
  description: string;
}

export interface LoyaltyRepository {
  /** Pass `tx` to read inside an open transaction (read + later write share one snapshot). */
  findByCustomerId(customerId: string, tx?: TransactionContext): Promise<LoyaltyAccount | null>;
  /**
   * Creates the customer's account with the schema defaults (0 points, no consent).
   * Idempotent under races: `customerId` is unique, and a concurrent duplicate
   * insert (P2002) is swallowed as a no-op.
   */
  createIfAbsent(customerId: string): Promise<void>;
  /**
   * Credits points atomically: inserts the EARN LoyaltyTransaction and increments
   * `totalPoints`, both on the caller's `tx` (LoyaltyTransaction is the source of
   * truth; the counter is a running total).
   */
  earn(input: EarnPointsInput, tx?: TransactionContext): Promise<void>;
}

export const LOYALTY_REPOSITORY = Symbol('LoyaltyRepository');
