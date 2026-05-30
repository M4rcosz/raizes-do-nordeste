import { describe, expect, it } from '@jest/globals';
import Big from 'big.js';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { OrderChannel } from '../value-objects/order-channel';

describe('Order', () => {
  describe('calculateTotalAmount', () => {
    it('sums the item subtotals', () => {
      expect(Order.calculateTotalAmount(['37.5', '9.99']).eq(new Big('47.49'))).toBe(true);
    });

    it('returns 0 for an empty order', () => {
      expect(Order.calculateTotalAmount([]).eq(new Big(0))).toBe(true);
    });
  });

  describe('constructor enforces the totalAmount invariant', () => {
    it('computes totalAmount from the items it was constructed with', () => {
      const items = [
        new OrderItem('i-1', 'o-1', 'p-1', 2, new Big('10'), null),
        new OrderItem('i-2', 'o-1', 'p-2', 1, new Big('5.50'), null),
      ];

      const order = new Order(
        'o-1',
        'bu-1',
        'c-1',
        null,
        0,
        0,
        null,
        OrderChannel.APP,
        'PENDING',
        new Date(),
        new Date(),
        null,
        items,
      );

      expect(order.totalAmount.eq(new Big('25.50'))).toBe(true);
    });
  });
});
