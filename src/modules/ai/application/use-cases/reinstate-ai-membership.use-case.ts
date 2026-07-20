import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { AiMembership } from '../../domain/entities/ai-membership.entity';
import {
  AI_MEMBERSHIP_REPOSITORY,
  type AiMembershipRepository,
} from '../../domain/repositories/ai-membership.repository';
import { AiMembershipNotFoundError } from '../errors/ai-membership-not-found.error';

export interface ReinstateAiMembershipInput {
  userId: string;
  actorId: string;
}

@Injectable()
export class ReinstateAiMembershipUseCase {
  constructor(
    @Inject(AI_MEMBERSHIP_REPOSITORY)
    private readonly memberships: AiMembershipRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(input: ReinstateAiMembershipInput): Promise<AiMembership> {
    // The conditional reinstate is the single source of truth: null = no membership,
    // changed = whether this call cleared the revoke. Deciding on its result keeps the
    // audit honest under a concurrent reinstate.
    const result = await this.memberships.reinstate(input.userId, input.actorId);
    if (!result) {
      throw new AiMembershipNotFoundError(`User ${input.userId} has no AI membership.`);
    }

    // Audit only a real transition. An already-active row returns changed = false, so
    // we do not double-log the same action.
    if (result.changed) {
      await this.audit.log({
        userId: input.actorId,
        action: AUDIT_ACTIONS.AI_MEMBERSHIP_REINSTATED,
        entity: 'AiMembership',
        entityId: result.membership.id,
        metadata: { targetUserId: input.userId },
      });
    }

    return result.membership;
  }
}
