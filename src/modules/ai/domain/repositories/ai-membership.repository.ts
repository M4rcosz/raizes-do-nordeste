import { AiMembership } from '../entities/ai-membership.entity';

/**
 * Result of a revoke/reinstate. `changed` is true only when this call flipped the
 * revoked state; false means the row was already in the target state (a concurrent
 * actor got there first), so the caller can skip the audit log.
 */
export interface AiMembershipTransition {
  changed: boolean;
  membership: AiMembership;
}

export interface AiMembershipRepository {
  findByUserId(userId: string): Promise<AiMembership | null>;
  /**
   * Creates the user's membership with `initialBalance`. `userId` is unique, so a
   * concurrent duplicate insert (P2002) is mapped to AiMembershipAlreadyExistsError.
   * `actorId` is recorded as updatedById.
   */
  create(userId: string, initialBalance: number, actorId: string): Promise<AiMembership>;
  /**
   * Applies a signed admin adjustment under a conditional guard (revoked_at IS NULL,
   * and for a debit also token_balance >= |delta|), so a revoked wallet is never
   * touched and the balance never goes negative. Returns null when the write matched
   * no row (revoked, insufficient balance, or the membership vanished) - the caller
   * re-reads to report the reason. `actorId` is recorded as updatedById.
   */
  adjustBalance(userId: string, delta: number, actorId: string): Promise<AiMembership | null>;
  /**
   * Spends `amount` tokens with a conditional decrement (revoked_at IS NULL AND
   * token_balance >= amount). Returns false when nothing matched (revoked, insufficient
   * balance, or a race) - a revoke that lands mid-conversation stops further spend.
   */
  debit(userId: string, amount: number): Promise<boolean>;
  /**
   * Soft-revokes the membership by stamping revoked_at, guarded by revoked_at IS NULL
   * so concurrent revokes converge to one write. The balance is never touched. Returns
   * null when no row exists; otherwise `changed` reports whether this call did the stamp.
   * `actorId` is recorded as updatedById.
   */
  revoke(userId: string, actorId: string): Promise<AiMembershipTransition | null>;
  /**
   * Clears revoked_at, guarded by revoked_at IS NOT NULL. Balance is untouched, so the
   * prior state is fully restored. Returns null when no row exists; `changed` reports
   * whether this call did the clear. `actorId` is recorded as updatedById.
   */
  reinstate(userId: string, actorId: string): Promise<AiMembershipTransition | null>;
}

export const AI_MEMBERSHIP_REPOSITORY = Symbol('AiMembershipRepository');
