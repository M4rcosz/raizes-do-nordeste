import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { LoyaltyAccount } from '../entities/loyalty-account.entity';

export interface EarnPointsInput {
  loyaltyAccountId: string;
  orderId: string;
  /** Points to credit; always positive. */
  points: number;
  description: string;
}

export interface RedeemPointsInput {
  loyaltyAccountId: string;
  orderId: string;
  /** Points to debit; always positive (sign convention mirrors EARN). */
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
   * truth; the counter is a running total). `tx` is required so the insert and the
   * increment can never land apart.
   */
  earn(input: EarnPointsInput, tx: TransactionContext): Promise<void>;
  /**
   * Debits points atomically on the caller's `tx`: inserts the REDEEM
   * LoyaltyTransaction (points positive) and decrements `totalPoints` with a
   * conditional UPDATE (totalPoints >= points). The condition is the optimistic
   * concurrency check: if a concurrent redemption already drained the balance the
   * decrement matches no row and this throws CONFLICT instead of going negative.
   * A duplicate REDEEM for the same order (P2002 on orderId+type) also throws
   * CONFLICT. `tx` is required so the insert and the decrement never land apart.
   */
  redeem(input: RedeemPointsInput, tx: TransactionContext): Promise<void>;
  /**
   * LGPD consent grant (upsert). Creates a consented account when the customer has
   * none, or marks an existing one consented: consentGiven=true, consentDate=now,
   * consentRevokedAt cleared. Returns the resulting account.
   */
  grantConsent(customerId: string): Promise<LoyaltyAccount>;
  /**
   * Withdraws consent on an existing account: consentGiven=false, consentRevokedAt=now.
   * Returns null when the customer has no account (nothing to revoke).
   */
  revokeConsent(customerId: string): Promise<LoyaltyAccount | null>;
}

export const LOYALTY_REPOSITORY = Symbol('LoyaltyRepository');
