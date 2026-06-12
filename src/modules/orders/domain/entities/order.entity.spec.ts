import { describe, expect, it } from '@jest/globals';
import Big from 'big.js';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { OrderChannel } from '../value-objects/order-channel';
import { OrderStatus } from '../value-objects/order-status';
import { InvalidOrderStatusTransitionError } from '../errors/invalid-order-status-transition.error';
import { InvalidOrderTotalError } from '../errors/invalid-order-total.error';

// Two lines summing to a gross subtotal of 25.50.
const sampleItems = (): OrderItem[] => [
  new OrderItem('i-1', 'o-1', 'p-1', 2, new Big('10'), null),
  new OrderItem('i-2', 'o-1', 'p-2', 1, new Big('5.50'), null),
];

const makeOrder = (totalAmount: Big, orderItems: OrderItem[] = sampleItems()): Order =>
  new Order(
    'o-1',
    'bu-1',
    'c-1',
    null,
    0,
    0,
    totalAmount,
    null,
    OrderChannel.APP,
    OrderStatus.PENDING,
    new Date(),
    new Date(),
    null,
    orderItems,
  );

const orderWithStatus = (status: OrderStatus): Order =>
  new Order(
    'o-1',
    'bu-1',
    'c-1',
    null,
    0,
    0,
    new Big(0),
    null,
    OrderChannel.APP,
    status,
    new Date(),
    new Date(),
    null,
    [],
  );

describe('Order', () => {
  describe('calculateItemsSubtotal', () => {
    it('sums the item subtotals', () => {
      expect(Order.calculateItemsSubtotal(['37.5', '9.99']).eq(new Big('47.49'))).toBe(true);
    });

    it('returns 0 for an empty order', () => {
      expect(Order.calculateItemsSubtotal([]).eq(new Big(0))).toBe(true);
    });
  });

  describe('computeTotal (discount rule)', () => {
    it('subtracts the discount from the gross subtotal', () => {
      expect(Order.computeTotal(new Big('25.50'), new Big('5.50')).eq(new Big('20'))).toBe(true);
    });

    it('equals the subtotal when there is no discount', () => {
      expect(Order.computeTotal(new Big('25.50'), new Big(0)).eq(new Big('25.50'))).toBe(true);
    });

    it('rejects a negative discount (a surcharge)', () => {
      expect(() => Order.computeTotal(new Big('25.50'), new Big('-1'))).toThrow(
        InvalidOrderTotalError,
      );
    });

    it('rejects a discount larger than the subtotal', () => {
      expect(() => Order.computeTotal(new Big('25.50'), new Big('30'))).toThrow(
        InvalidOrderTotalError,
      );
    });
  });

  describe('constructor total/discount', () => {
    it('exposes the gross subtotal computed from its items', () => {
      expect(makeOrder(new Big('25.50')).itemsSubtotal.eq(new Big('25.50'))).toBe(true);
    });

    it('keeps the persisted total authoritative and derives the discount', () => {
      const order = makeOrder(new Big('20'));
      expect(order.totalAmount.eq(new Big('20'))).toBe(true);
      expect(order.discountAmount.eq(new Big('5.50'))).toBe(true);
    });

    it('derives a zero discount when total equals the subtotal', () => {
      expect(makeOrder(new Big('25.50')).discountAmount.eq(new Big(0))).toBe(true);
    });

    it('rejects a total above the subtotal (corrupt data)', () => {
      expect(() => makeOrder(new Big('30'))).toThrow(InvalidOrderTotalError);
    });

    it('rejects a negative total', () => {
      expect(() => makeOrder(new Big('-1'))).toThrow(InvalidOrderTotalError);
    });
  });

  describe('assertCanTransitionTo', () => {
    it('does not throw on a valid transition', () => {
      expect(() =>
        orderWithStatus(OrderStatus.PENDING).assertCanTransitionTo(OrderStatus.CONFIRMED),
      ).not.toThrow();
    });

    it('throws InvalidOrderStatusTransitionError on an invalid transition', () => {
      expect(() =>
        orderWithStatus(OrderStatus.PENDING).assertCanTransitionTo(OrderStatus.DELIVERED),
      ).toThrow(InvalidOrderStatusTransitionError);
    });

    it('throws out of a terminal state', () => {
      expect(() =>
        orderWithStatus(OrderStatus.DELIVERED).assertCanTransitionTo(OrderStatus.READY),
      ).toThrow(InvalidOrderStatusTransitionError);
    });
  });
});
