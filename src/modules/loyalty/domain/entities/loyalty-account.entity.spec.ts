import { describe, expect, it } from '@jest/globals';
import { LoyaltyAccount } from './loyalty-account.entity';

const buildAccount = (consentGiven: boolean): LoyaltyAccount =>
  new LoyaltyAccount('la-1', 'c-1', 0, consentGiven, null, new Date(), new Date());

describe('LoyaltyAccount', () => {
  describe('canEarn', () => {
    it('earns only with consent given', () => {
      expect(buildAccount(true).canEarn()).toBe(true);
      expect(buildAccount(false).canEarn()).toBe(false);
    });
  });

  describe('pointsForAmount', () => {
    it.each([
      ['25.00', 2],
      ['10.00', 1],
      ['9.99', 0],
      ['0.00', 0],
      ['19.99', 1],
      ['100.00', 10],
    ])('floor(%s / 10) = %i points', (amount, expected) => {
      expect(LoyaltyAccount.pointsForAmount(amount)).toBe(expected);
    });
  });
});
