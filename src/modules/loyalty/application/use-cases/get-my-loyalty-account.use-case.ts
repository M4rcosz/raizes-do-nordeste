import { Inject, Injectable } from '@nestjs/common';
import { LoyaltyAccount } from '../../domain/entities/loyalty-account.entity';
import {
  LOYALTY_REPOSITORY,
  type LoyaltyRepository,
} from '../../domain/repositories/loyalty.repository';
import { LoyaltyAccountNotFoundError } from '../errors/loyalty-account-not-found.error';

@Injectable()
export class GetMyLoyaltyAccountUseCase {
  constructor(
    @Inject(LOYALTY_REPOSITORY)
    private readonly accounts: LoyaltyRepository,
  ) {}

  async execute(customerId: string): Promise<LoyaltyAccount> {
    const account = await this.accounts.findByCustomerId(customerId);
    if (!account) {
      throw new LoyaltyAccountNotFoundError(
        'No loyalty account yet - it is created on your first order.',
      );
    }
    return account;
  }
}
