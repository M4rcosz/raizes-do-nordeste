import { Inject, Injectable } from '@nestjs/common';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { LoyaltyAccount } from '../../domain/entities/loyalty-account.entity';
import {
  LOYALTY_REPOSITORY,
  type LoyaltyRepository,
} from '../../domain/repositories/loyalty.repository';
import type { EarnForOrderInput, LoyaltyEarning } from '../ports/loyalty-earning.port';

/**
 * Implements the LOYALTY_EARNING port (RN-31): floor(paid amount / 10) points,
 * credited inside the payment's settlement transaction. No account, no consent
 * or zero points = silent no-op - loyalty never blocks a payment.
 */
@Injectable()
export class EarnPointsUseCase implements LoyaltyEarning {
  constructor(
    @Inject(LOYALTY_REPOSITORY)
    private readonly accounts: LoyaltyRepository,
  ) {}

  async earnForOrder(input: EarnForOrderInput, tx: TransactionContext): Promise<void> {
    const account = await this.accounts.findByCustomerId(input.customerId, tx);
    if (!account || !account.canEarn()) {
      return;
    }

    const points = LoyaltyAccount.pointsForAmount(input.totalAmount);
    if (points <= 0) {
      return;
    }

    await this.accounts.earn(
      {
        loyaltyAccountId: account.id,
        orderId: input.orderId,
        points,
        description: `Points earned for order ${input.orderId}`,
      },
      tx,
    );
  }
}
