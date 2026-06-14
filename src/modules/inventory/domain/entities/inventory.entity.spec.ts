import { describe, expect, it } from '@jest/globals';
import { Inventory } from './inventory.entity';

const buildInventory = (quantity: number, minQuantity: number): Inventory =>
  new Inventory('inv-1', 'bu-1', 'p-1', quantity, minQuantity, new Date(), new Date());

describe('Inventory', () => {
  describe('isLowStock', () => {
    it('is low when the balance is below the threshold', () => {
      expect(buildInventory(2, 5).isLowStock()).toBe(true);
    });

    it('is low when the balance sits exactly on the threshold', () => {
      expect(buildInventory(5, 5).isLowStock()).toBe(true);
    });

    it('is not low when the balance is above the threshold', () => {
      expect(buildInventory(6, 5).isLowStock()).toBe(false);
    });

    it('is low at zero balance even when the threshold is zero', () => {
      expect(buildInventory(0, 0).isLowStock()).toBe(true);
    });
  });
});
