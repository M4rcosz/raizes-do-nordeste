import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { AiMembership } from '../../domain/entities/ai-membership.entity';
import {
  AI_MEMBERSHIP_REPOSITORY,
  type AiMembershipRepository,
} from '../../domain/repositories/ai-membership.repository';
import { AiMembershipAlreadyExistsError } from '../errors/ai-membership-already-exists.error';

export interface EnrollAiMembershipInput {
  userId: string;
  initialBalance: number;
  actorId: string;
}

@Injectable()
export class EnrollAiMembershipUseCase {
  constructor(
    @Inject(AI_MEMBERSHIP_REPOSITORY)
    private readonly memberships: AiMembershipRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(input: EnrollAiMembershipInput): Promise<AiMembership> {
    const existing = await this.memberships.findByUserId(input.userId);
    if (existing) {
      throw new AiMembershipAlreadyExistsError(
        `User ${input.userId} already has an AI membership.`,
      );
    }

    // A concurrent enroll losing the unique-userId race throws
    // AiMembershipAlreadyExistsError from the repo; we let it propagate.
    const membership = await this.memberships.create(
      input.userId,
      input.initialBalance,
      input.actorId,
    );

    await this.audit.log({
      userId: input.actorId,
      action: AUDIT_ACTIONS.AI_MEMBERSHIP_ENROLLED,
      entity: 'AiMembership',
      entityId: membership.id,
      metadata: { targetUserId: input.userId, initialBalance: input.initialBalance },
    });

    return membership;
  }
}
