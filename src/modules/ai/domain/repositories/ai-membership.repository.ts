import { AiMembership } from '../entities/ai-membership.entity';

export interface AiMembershipRepository {
  findByUserId(userId: string): Promise<AiMembership | null>;
  /**
   * Creates the user's membership with `initialBalance`. `userId` is unique, so a
   * concurrent duplicate insert (P2002) is mapped to AiMembershipAlreadyExistsError.
   * `actorId` is recorded as updatedById.
   */
  create(userId: string, initialBalance: number, actorId: string): Promise<AiMembership>;
  /**
   * Applies a signed admin adjustment. A positive delta increments; a negative delta
   * decrements under a conditional guard (token_balance >= |delta|) so the balance
   * never goes negative. Returns null when the conditional write matched no row
   * (insufficient balance or the membership vanished), so the caller can reject.
   * `actorId` is recorded as updatedById.
   */
  adjustBalance(userId: string, delta: number, actorId: string): Promise<AiMembership | null>;
  /**
   * Spends `amount` tokens with a conditional decrement (token_balance >= amount).
   * Returns false when nothing matched (insufficient balance or race). This is the
   * Part 2 metering seam - no HTTP route calls it yet.
   */
  debit(userId: string, amount: number): Promise<boolean>;
}

export const AI_MEMBERSHIP_REPOSITORY = Symbol('AiMembershipRepository');
