import Big from 'big.js';

/** Earning rate: 1 point per R$10 paid, fraction discarded (RN-31). */
const EARN_RATE_BRL_PER_POINT = 10;

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
    return Number(new Big(totalAmount).div(EARN_RATE_BRL_PER_POINT).round(0, Big.roundDown));
  }
}
