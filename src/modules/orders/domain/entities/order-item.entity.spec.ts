import { describe, expect, it } from '@jest/globals';
import Big from 'big.js';
import { OrderItem } from './order-item.entity';

describe('OrderItem', () => {
  describe('calculateSubtotal', () => {
    it('multiplies unit price by quantity preserving decimals', () => {
      expect(OrderItem.calculateSubtotal(3, '12.50').eq(new Big('37.5'))).toBe(true);
    });

    it('returns the unit price when quantity is 1', () => {
      expect(OrderItem.calculateSubtotal(1, '9.99').eq(new Big('9.99'))).toBe(true);
    });
  });

  describe('constructor enforces the subtotal invariant', () => {
    it('computes subtotal from quantity and unitPrice — caller cannot pass an inconsistent value', () => {
      const item = new OrderItem('i-1', 'o-1', 'p-1', 4, new Big('7.25'), null);

      expect(item.subtotal.eq(new Big('29'))).toBe(true);
    });
  });
});
