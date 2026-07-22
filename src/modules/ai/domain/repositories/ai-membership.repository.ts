import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import type { TimestampKeyset } from '@shared/pagination/keyset-cursor';
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

/**
 * Deliberately NOT CursorPaginationParams: `keyset` is the sort key of the previous
 * page's last row, not a row id to seek to - the predicate compares values, so the
 * cursor row need not still exist. Here the keyset timestamp is createdAt.
 */
export interface ListAiMembershipsInput {
  take: number;
  keyset?: TimestampKeyset;
}

export interface AiMembershipRepository {
  findByUserId(userId: string): Promise<AiMembership | null>;
  /**
   * One page of memberships, revoked ones included, newest first. Over-fetch by one
   * (`take: limit + 1`) to detect a next page. Paginated rather than unbounded so the
   * admin report cannot turn into a full-table read as enrollment grows.
   */
  listAll(input: ListAiMembershipsInput): Promise<AiMembership[]>;
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
   * `tx` lets the caller keep the decrement and its usage-ledger row in one unit.
   */
  debit(userId: string, amount: number, tx?: TransactionContext): Promise<boolean>;
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
