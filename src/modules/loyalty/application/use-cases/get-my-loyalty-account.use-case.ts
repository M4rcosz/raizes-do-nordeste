import { Inject, Injectable } from '@nestjs/common';
import { LoyaltyAccount } from '../../domain/entities/loyalty-account.entity';
import {
  LOYALTY_REPOSITORY,
  type LoyaltyRepository,
} from '../../domain/repositories/loyalty.repository';
import { LoyaltyAccountNotFoundError } from '../errors/loyalty-account-not-found.error';
import { LoyaltyFetchError } from '../errors/loyalty-fetch.error';

@Injectable()
export class GetMyLoyaltyAccountUseCase {
  constructor(
    @Inject(LOYALTY_REPOSITORY)
    private readonly accounts: LoyaltyRepository,
  ) {}

  async execute(customerId: string): Promise<LoyaltyAccount> {
    let account: LoyaltyAccount | null;
    try {
      account = await this.accounts.findByCustomerId(customerId);
    } catch (err) {
      throw new LoyaltyFetchError('Could not retrieve your loyalty account.', { cause: err });
    }

    if (!account) {
      throw new LoyaltyAccountNotFoundError(
        'No loyalty account yet - it is created on your first order.',
      );
    }
    return account;
  }
}
