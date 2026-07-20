import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { AiMembership } from '../../domain/entities/ai-membership.entity';
import {
  AI_MEMBERSHIP_REPOSITORY,
  type AiMembershipRepository,
} from '../../domain/repositories/ai-membership.repository';
import { TokenBudgetExceededError } from '../../domain/errors/token-budget-exceeded.error';
import { AiMembershipNotFoundError } from '../errors/ai-membership-not-found.error';
import { AiMembershipRevokedError } from '../errors/ai-membership-revoked.error';

export interface AdjustAiMembershipBalanceInput {
  userId: string;
  /** Signed: positive credits (top-up), negative debits (clawback). Zero is rejected. */
  delta: number;
  actorId: string;
}

@Injectable()
export class AdjustAiMembershipBalanceUseCase {
  constructor(
    @Inject(AI_MEMBERSHIP_REPOSITORY)
    private readonly memberships: AiMembershipRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(input: AdjustAiMembershipBalanceInput): Promise<AiMembership> {
    // A no-op adjustment is a bad request, not a valid write.
    if (input.delta === 0) {
      throw new TokenBudgetExceededError('Adjustment delta must be non-zero.');
    }

    const existing = await this.memberships.findByUserId(input.userId);
    if (!existing) {
      throw new AiMembershipNotFoundError(`User ${input.userId} has no AI membership.`);
    }

    // Can't top up or claw back a revoked wallet; reinstate it first.
    if (existing.isRevoked) {
      throw new AiMembershipRevokedError(
        `User ${input.userId} AI membership is revoked; reinstate it before adjusting.`,
      );
    }

    // A positive delta credits: run the domain guard so an int4 overflow becomes a
    // clean 422 instead of a Postgres 22003 escaping as a 500. The negative path is
    // guarded below by the repo's conditional decrement (count = 0 -> null).
    if (input.delta > 0) {
      existing.credit(input.delta);
    }

    const updated = await this.memberships.adjustBalance(input.userId, input.delta, input.actorId);
    if (!updated) {
      // The guarded write (revoked_at IS NULL, and for a debit token_balance >= |delta|)
      // matched no row. In the common path that is an over-clawback. Under a concurrent
      // revoke or delete landing between the pre-check and the write, re-read to report
      // the real reason instead of a misleading "below zero".
      const current = await this.memberships.findByUserId(input.userId);
      if (!current) {
        throw new AiMembershipNotFoundError(`User ${input.userId} has no AI membership.`);
      }
      if (current.isRevoked) {
        throw new AiMembershipRevokedError(
          `User ${input.userId} AI membership was revoked; reinstate before adjusting.`,
        );
      }
      throw new TokenBudgetExceededError(
        `Adjustment of ${input.delta} would drive user ${input.userId} balance below zero.`,
      );
    }

    await this.audit.log({
      userId: input.actorId,
      action: AUDIT_ACTIONS.AI_MEMBERSHIP_ADJUSTED,
      entity: 'AiMembership',
      entityId: updated.id,
      metadata: {
        targetUserId: input.userId,
        delta: input.delta,
        balanceAfter: updated.tokenBalance,
      },
    });

    return updated;
  }
}
