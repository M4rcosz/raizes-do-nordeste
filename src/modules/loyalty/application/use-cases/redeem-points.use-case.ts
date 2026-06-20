import { Inject, Injectable } from '@nestjs/common';
import { Money } from '@shared/domain/value-objects/money';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { LoyaltyAccount } from '../../domain/entities/loyalty-account.entity';
import { InsufficientPointsError } from '../../domain/errors/insufficient-points.error';
import {
  LOYALTY_REPOSITORY,
  type LoyaltyRepository,
} from '../../domain/repositories/loyalty.repository';
import type {
  LoyaltyRedemption,
  QuoteDiscountInput,
  RedeemForOrderInput,
} from '../ports/loyalty-redemption.port';

/**
 * Implements the LOYALTY_REDEMPTION port: converts points to a money discount at the
 * redeem rate (1 point = R$0.10) and debits them inside the order-creation tx. Unlike
 * EARN this never silently no-ops - a missing account, missing consent, too few points
 * or a discount above the subtotal all reject so the order does not proceed on a bad
 * redemption. The atomic balance guard lives in the repository (optimistic CONFLICT).
 */
@Injectable()
export class RedeemPointsUseCase implements LoyaltyRedemption {
  constructor(
    @Inject(LOYALTY_REPOSITORY)
    private readonly accounts: LoyaltyRepository,
  ) {}

  async quoteDiscount(input: QuoteDiscountInput, tx: TransactionContext): Promise<string> {
    const { discount } = await this.resolveRedemption(input, tx);
    return discount;
  }

  async redeemForOrder(input: RedeemForOrderInput, tx: TransactionContext): Promise<string> {
    const { account, discount } = await this.resolveRedemption(input, tx);

    await this.accounts.redeem(
      {
        loyaltyAccountId: account.id,
        orderId: input.orderId,
        points: input.points,
        description: `Points redeemed for order ${input.orderId}`,
      },
      tx,
    );

    return discount;
  }

  /**
   * Shared eligibility + pricing: loads the account, enforces consent/balance/ceiling,
   * and returns the deterministic discount. The balance check here is a fast-fail for
   * a precise INVALID; the repository's conditional decrement is the real atomic guard.
   */
  private async resolveRedemption(
    input: QuoteDiscountInput,
    tx: TransactionContext,
  ): Promise<{ account: LoyaltyAccount; discount: string }> {
    const account = await this.accounts.findByCustomerId(input.customerId, tx);
    if (!account || !account.canRedeem(input.points)) {
      throw new InsufficientPointsError(
        `Customer ${input.customerId} cannot redeem ${input.points} points.`,
      );
    }

    const discount = LoyaltyAccount.discountForPoints(input.points);
    // Ceiling: points may not buy more than the order is worth. Order.computeTotal
    // also clamps to [0, subtotal] as a net, but rejecting here gives a precise
    // INVALID instead of letting an over-redemption slip toward the order total.
    if (Money.fromDecimalString(discount).greaterThan(Money.fromDecimalString(input.subtotal))) {
      throw new InsufficientPointsError(
        `Redeeming ${input.points} points (R$${discount}) exceeds the order subtotal R$${input.subtotal}.`,
      );
    }

    return { account, discount };
  }
}
