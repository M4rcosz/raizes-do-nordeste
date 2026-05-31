import { describe, expect, it } from '@jest/globals';
import { canTransition, OrderStatus } from './order-status';

describe('order status state machine', () => {
  it.each<[OrderStatus, OrderStatus]>([
    [OrderStatus.PENDING, OrderStatus.CONFIRMED],
    [OrderStatus.PENDING, OrderStatus.CANCELLED],
    [OrderStatus.CONFIRMED, OrderStatus.PREPARING],
    [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
    [OrderStatus.PREPARING, OrderStatus.READY],
    [OrderStatus.PREPARING, OrderStatus.CANCELLED],
    [OrderStatus.READY, OrderStatus.DELIVERED],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each<[OrderStatus, OrderStatus]>([
    [OrderStatus.PENDING, OrderStatus.PREPARING],
    [OrderStatus.PENDING, OrderStatus.DELIVERED],
    [OrderStatus.PENDING, OrderStatus.PENDING],
    [OrderStatus.CONFIRMED, OrderStatus.READY],
    [OrderStatus.READY, OrderStatus.PREPARING],
    [OrderStatus.READY, OrderStatus.CANCELLED],
    [OrderStatus.DELIVERED, OrderStatus.READY],
    [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
    [OrderStatus.CANCELLED, OrderStatus.PENDING],
  ])('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});
