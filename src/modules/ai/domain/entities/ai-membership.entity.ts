import { TokenBudgetExceededError } from '../errors/token-budget-exceeded.error';

/** int4 ceiling: the token_balance column is an Int, so no single value can exceed this. */
export const MAX_TOKEN_BALANCE = 2_147_483_647;

export class AiMembership {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly tokenBalance: number,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  /**
   * Fast-fail guard for a token spend: rejects a non-positive/non-integer amount and
   * a spend larger than the balance, returning the remaining balance otherwise. The
   * real decrement is the repo's conditional updateMany (atomic, race-safe); this
   * mirrors loyalty redeem - it exists for unit tests and to reject bad input early.
   */
  debit(amount: number): number {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new TokenBudgetExceededError(
        `Token debit amount must be a positive integer, got ${amount}.`,
      );
    }
    if (amount > this.tokenBalance) {
      throw new TokenBudgetExceededError(
        `Insufficient tokens: asked ${amount}, balance ${this.tokenBalance}.`,
      );
    }
    return this.tokenBalance - amount;
  }

  /**
   * Fast-fail guard for a token top-up: rejects a non-positive/non-integer amount and
   * a credit that would overflow the int4 column, returning the new balance otherwise.
   * Symmetric to debit. Compared as MAX - balance so the check itself never overflows.
   */
  credit(amount: number): number {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new TokenBudgetExceededError(
        `Token credit amount must be a positive integer, got ${amount}.`,
      );
    }
    if (amount > MAX_TOKEN_BALANCE - this.tokenBalance) {
      throw new TokenBudgetExceededError(
        `Credit of ${amount} would exceed the max balance ${MAX_TOKEN_BALANCE} (current ${this.tokenBalance}).`,
      );
    }
    return this.tokenBalance + amount;
  }
}
