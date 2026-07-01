import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@shared/transaction/transaction-runner.port';
import {
  LOYALTY_REPOSITORY,
  type LoyaltyRepository,
} from '@modules/loyalty/domain/repositories/loyalty.repository';
import { computeExpiredPoints } from '@modules/loyalty/domain/loyalty-expiry';

/**
 * Nets out loyalty points past their 12-month window. For each candidate account it
 * reconstructs the ledger FIFO (domain), then records one EXPIRE movement for the
 * expired total inside its own transaction, so a read and its write share a snapshot
 * and accounts never block each other. Returns the total points expired.
 */
@Injectable()
export class ExpireLoyaltyPointsUseCase {
  constructor(
    @Inject(LOYALTY_REPOSITORY)
    private readonly loyalty: LoyaltyRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
  ) {}

  async execute(now: Date = new Date()): Promise<number> {
    const accountIds = await this.loyalty.findAccountIdsWithExpirablePoints(now);

    let totalExpired = 0;
    for (const id of accountIds) {
      totalExpired += await this.expireAccount(id, now);
    }
    return totalExpired;
  }

  private expireAccount(loyaltyAccountId: string, now: Date): Promise<number> {
    return this.transactions.run(async (tx) => {
      const ledger = await this.loyalty.findLedger(loyaltyAccountId, tx);
      const toExpire = computeExpiredPoints(ledger, now);
      if (toExpire <= 0) {
        return 0;
      }
      const applied = await this.loyalty.expire(
        {
          loyaltyAccountId,
          points: toExpire,
          description: `Expired ${toExpire} point(s) past the 12-month window.`,
        },
        tx,
      );
      return applied ? toExpire : 0;
    });
  }
}
