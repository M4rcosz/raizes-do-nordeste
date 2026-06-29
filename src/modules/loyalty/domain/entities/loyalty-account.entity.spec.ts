import { describe, expect, it } from '@jest/globals';
import { LoyaltyAccount } from './loyalty-account.entity';

const buildAccount = (consentGiven: boolean): LoyaltyAccount =>
  new LoyaltyAccount('la-1', 'c-1', 0, consentGiven, null, null, new Date(), new Date());

const buildAccountWith = (consentGiven: boolean, totalPoints: number): LoyaltyAccount =>
  new LoyaltyAccount('la-1', 'c-1', totalPoints, consentGiven, null, null, new Date(), new Date());

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

  describe('canRedeem', () => {
    it('redeems when consent is given and the balance covers the points', () => {
      expect(buildAccountWith(true, 100).canRedeem(100)).toBe(true);
      expect(buildAccountWith(true, 100).canRedeem(50)).toBe(true);
    });

    it('refuses without consent even with enough points', () => {
      expect(buildAccountWith(false, 100).canRedeem(50)).toBe(false);
    });

    it('refuses when the balance is below the requested points', () => {
      expect(buildAccountWith(true, 49).canRedeem(50)).toBe(false);
    });

    it('refuses non-positive or non-integer point amounts', () => {
      expect(buildAccountWith(true, 100).canRedeem(0)).toBe(false);
      expect(buildAccountWith(true, 100).canRedeem(-10)).toBe(false);
      expect(buildAccountWith(true, 100).canRedeem(1.5)).toBe(false);
    });
  });

  describe('discountForPoints', () => {
    it.each([
      [100, '10.00'],
      [1, '0.10'],
      [150, '15.00'],
      [0, '0.00'],
      [7, '0.70'],
    ])('%i points = R$%s at 1 point = R$0.10', (points, expected) => {
      expect(LoyaltyAccount.discountForPoints(points)).toBe(expected);
    });
  });
});
