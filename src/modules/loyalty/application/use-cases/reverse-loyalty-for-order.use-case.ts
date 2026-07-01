import { Inject, Injectable } from '@nestjs/common';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import {
  LOYALTY_REPOSITORY,
  type LoyaltyRepository,
} from '@modules/loyalty/domain/repositories/loyalty.repository';
import { type LoyaltyReversal, type ReverseForOrderInput } from '../ports/loyalty-reversal.port';

/**
 * Compensates a cancelled order on the loyalty ledger: refunds the points the customer
 * spent and claws back the points the order granted, both as signed ADJUSTMENT movements
 * on the caller's transaction. A no-account or no-points order is a no-op. The clawback is
 * sized against the post-refund balance so it never drives the account negative.
 */
@Injectable()
export class ReverseLoyaltyForOrderUseCase implements LoyaltyReversal {
  constructor(
    @Inject(LOYALTY_REPOSITORY)
    private readonly loyalty: LoyaltyRepository,
  ) {}

  async reverseForOrder(input: ReverseForOrderInput, tx: TransactionContext): Promise<void> {
    const { customerId, orderId, pointsEarned, pointsRedeemed } = input;
    if (pointsEarned <= 0 && pointsRedeemed <= 0) {
      return;
    }

    const account = await this.loyalty.findByCustomerId(customerId, tx);
    if (!account) {
      return;
    }

    // Refund first (credit): the spent points come back.
    if (pointsRedeemed > 0) {
      await this.loyalty.adjust(
        {
          loyaltyAccountId: account.id,
          points: pointsRedeemed,
          description: `Refund of ${pointsRedeemed} point(s) redeemed on cancelled order ${orderId}.`,
        },
        tx,
      );
    }

    // Clawback (debit), capped at the post-refund balance so it can never go negative.
    if (pointsEarned > 0) {
      const available = account.totalPoints + Math.max(pointsRedeemed, 0);
      const clawback = Math.min(pointsEarned, available);
      if (clawback > 0) {
        await this.loyalty.adjust(
          {
            loyaltyAccountId: account.id,
            points: -clawback,
            description: `Clawback of ${clawback} point(s) earned on cancelled order ${orderId}.`,
          },
          tx,
        );
      }
    }
  }
}
