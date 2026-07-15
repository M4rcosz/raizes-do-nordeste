import { Inject, Injectable } from '@nestjs/common';
import { AiMembership } from '../../domain/entities/ai-membership.entity';
import {
  AI_MEMBERSHIP_REPOSITORY,
  type AiMembershipRepository,
} from '../../domain/repositories/ai-membership.repository';
import { AiMembershipNotFoundError } from '../errors/ai-membership-not-found.error';
import { AiMembershipFetchError } from '../errors/ai-membership-fetch.error';

@Injectable()
export class GetMyAiMembershipUseCase {
  constructor(
    @Inject(AI_MEMBERSHIP_REPOSITORY)
    private readonly memberships: AiMembershipRepository,
  ) {}

  async execute(userId: string): Promise<AiMembership> {
    let membership: AiMembership | null;
    try {
      membership = await this.memberships.findByUserId(userId);
    } catch (err) {
      throw new AiMembershipFetchError('Could not retrieve your AI membership.', { cause: err });
    }

    if (!membership) {
      throw new AiMembershipNotFoundError('No AI membership yet - ask an admin to enroll you.');
    }
    return membership;
  }
}
