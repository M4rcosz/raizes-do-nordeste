import { describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { OrderChannel } from '../value-objects/order-channel';
import { OrderStatus } from '../value-objects/order-status';
import { InvalidOrderStatusTransitionError } from '../errors/invalid-order-status-transition.error';
import { InvalidOrderTotalError } from '../errors/invalid-order-total.error';

// Two lines summing to a gross subtotal of 25.50.
const sampleItems = (): OrderItem[] => [
  new OrderItem('i-1', 'o-1', 'p-1', 2, Money.fromDecimalString('10'), null),
  new OrderItem('i-2', 'o-1', 'p-2', 1, Money.fromDecimalString('5.50'), null),
];

const makeOrder = (totalAmount: Money, orderItems: OrderItem[] = sampleItems()): Order =>
  new Order(
    'o-1',
    'bu-1',
    'c-1',
    null,
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
    null,
    0,
    0,
    Money.zero(),
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
      expect(
        Order.calculateItemsSubtotal(['37.5', '9.99']).equals(Money.fromDecimalString('47.49')),
      ).toBe(true);
    });

    it('returns 0 for an empty order', () => {
      expect(Order.calculateItemsSubtotal([]).equals(Money.zero())).toBe(true);
    });
  });

  describe('computeTotal (discount rule)', () => {
    it('subtracts the discount from the gross subtotal', () => {
      expect(
        Order.computeTotal(
          Money.fromDecimalString('25.50'),
          Money.fromDecimalString('5.50'),
        ).equals(Money.fromDecimalString('20')),
      ).toBe(true);
    });

    it('equals the subtotal when there is no discount', () => {
      expect(
        Order.computeTotal(Money.fromDecimalString('25.50'), Money.zero()).equals(
          Money.fromDecimalString('25.50'),
        ),
      ).toBe(true);
    });

    it('rejects a negative discount (a surcharge)', () => {
      expect(() =>
        Order.computeTotal(Money.fromDecimalString('25.50'), Money.fromDecimalString('-1')),
      ).toThrow(InvalidOrderTotalError);
    });

    it('rejects a discount larger than the subtotal', () => {
      expect(() =>
        Order.computeTotal(Money.fromDecimalString('25.50'), Money.fromDecimalString('30')),
      ).toThrow(InvalidOrderTotalError);
    });
  });

  describe('constructor total/discount', () => {
    it('exposes the gross subtotal computed from its items', () => {
      expect(
        makeOrder(Money.fromDecimalString('25.50')).itemsSubtotal.equals(
          Money.fromDecimalString('25.50'),
        ),
      ).toBe(true);
    });

    it('keeps the persisted total authoritative and derives the discount', () => {
      const order = makeOrder(Money.fromDecimalString('20'));
      expect(order.totalAmount.equals(Money.fromDecimalString('20'))).toBe(true);
      expect(order.discountAmount.equals(Money.fromDecimalString('5.50'))).toBe(true);
    });

    it('derives a zero discount when total equals the subtotal', () => {
      expect(makeOrder(Money.fromDecimalString('25.50')).discountAmount.equals(Money.zero())).toBe(
        true,
      );
    });

    it('rejects a total above the subtotal (corrupt data)', () => {
      expect(() => makeOrder(Money.fromDecimalString('30'))).toThrow(InvalidOrderTotalError);
    });

    it('rejects a negative total', () => {
      expect(() => makeOrder(Money.fromDecimalString('-1'))).toThrow(InvalidOrderTotalError);
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
