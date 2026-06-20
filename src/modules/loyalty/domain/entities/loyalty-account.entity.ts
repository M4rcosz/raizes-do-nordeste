import { Money } from '@shared/domain/value-objects/money';

/** Earning rate: 1 point per R$10 paid, fraction discarded (RN-31). */
const EARN_RATE_BRL_PER_POINT = 10;

/** Redemption rate: 1 point = R$0.10 (10 cents), mirroring the earn rate. */
const REDEEM_RATE_CENTS_PER_POINT = 10;

export class LoyaltyAccount {
  constructor(
    public readonly id: string,
    public readonly customerId: string,
    public readonly totalPoints: number,
    public readonly consentGiven: boolean,
    public readonly consentDate: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  /**
   * LGPD gate: points only accrue after the customer consented to the program.
   * TODO(loyalty-consent): the consent-granting flow does not exist yet; accounts
   * are created with consentGiven=false and earn nothing until it ships.
   */
  canEarn(): boolean {
    return this.consentGiven;
  }

  /** floor(amount / 10): R$25.00 -> 2 points. Amount is a decimal string, never a number. */
  static pointsForAmount(totalAmount: string): number {
    // Points are integers, not money: work in integer cents so we never divide Money.
    const cents = Money.fromDecimalString(totalAmount).toCents();
    return Math.floor(cents / (EARN_RATE_BRL_PER_POINT * 100));
  }

  /**
   * Can these points be redeemed now: consent given and the balance covers them.
   * Points must be a positive integer; zero or negative is not redeemable.
   * TODO(loyalty-expire): once EXPIRE ships, totalPoints already nets expired points
   * out, so no extra guard is needed here.
   */
  canRedeem(points: number): boolean {
    return (
      this.consentGiven && Number.isInteger(points) && points > 0 && this.totalPoints >= points
    );
  }

  /** Money value of points at the redeem rate: 150 points -> R$15.00. Returns a decimal string. */
  static discountForPoints(points: number): string {
    return Money.fromCents(points * REDEEM_RATE_CENTS_PER_POINT).toDecimalString();
  }
}
