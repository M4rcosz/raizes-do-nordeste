import { describe, expect, it } from '@jest/globals';
import { AiMembership, MAX_TOKEN_BALANCE } from './ai-membership.entity';
import { TokenBudgetExceededError } from '../errors/token-budget-exceeded.error';

const buildMembership = (tokenBalance: number): AiMembership =>
  new AiMembership('ai-1', 'u-1', tokenBalance, new Date(), new Date());

describe('AiMembership', () => {
  describe('debit', () => {
    it('returns the remaining balance when the spend fits', () => {
      expect(buildMembership(100).debit(30)).toBe(70);
    });

    it('allows spending the whole balance', () => {
      expect(buildMembership(100).debit(100)).toBe(0);
    });

    it('throws when the spend exceeds the balance', () => {
      expect(() => buildMembership(50).debit(51)).toThrow(TokenBudgetExceededError);
    });

    it('throws on a zero amount', () => {
      expect(() => buildMembership(100).debit(0)).toThrow(TokenBudgetExceededError);
    });

    it('throws on a negative amount', () => {
      expect(() => buildMembership(100).debit(-10)).toThrow(TokenBudgetExceededError);
    });

    it('throws on a non-integer amount', () => {
      expect(() => buildMembership(100).debit(1.5)).toThrow(TokenBudgetExceededError);
    });
  });

  describe('credit', () => {
    it('returns the new balance when the top-up fits', () => {
      expect(buildMembership(100).credit(50)).toBe(150);
    });

    it('allows crediting exactly up to the int4 ceiling', () => {
      expect(buildMembership(MAX_TOKEN_BALANCE - 10).credit(10)).toBe(MAX_TOKEN_BALANCE);
    });

    it('throws when the credit would overflow the int4 ceiling', () => {
      expect(() => buildMembership(MAX_TOKEN_BALANCE - 10).credit(11)).toThrow(
        TokenBudgetExceededError,
      );
    });

    it('throws on a zero amount', () => {
      expect(() => buildMembership(100).credit(0)).toThrow(TokenBudgetExceededError);
    });

    it('throws on a negative amount', () => {
      expect(() => buildMembership(100).credit(-10)).toThrow(TokenBudgetExceededError);
    });

    it('throws on a non-integer amount', () => {
      expect(() => buildMembership(100).credit(1.5)).toThrow(TokenBudgetExceededError);
    });
  });
});
