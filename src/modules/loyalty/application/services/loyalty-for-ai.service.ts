import { Inject, Injectable } from '@nestjs/common';
import {
  LOYALTY_REPOSITORY,
  type LoyaltyRepository,
} from '@modules/loyalty/domain/repositories/loyalty.repository';
import type { LoyaltyForAi, LoyaltyForAiView } from '../ports/loyalty-for-ai.port';

@Injectable()
export class LoyaltyForAiService implements LoyaltyForAi {
  constructor(
    @Inject(LOYALTY_REPOSITORY)
    private readonly loyalty: LoyaltyRepository,
  ) {}

  async getForCustomer(customerId: string): Promise<LoyaltyForAiView | null> {
    const account = await this.loyalty.findByCustomerId(customerId);
    if (!account) {
      return null;
    }
    return {
      pointsBalance: account.totalPoints,
      hasConsent: account.consentGiven,
      enrolledAt: account.createdAt.toISOString(),
    };
  }
}
