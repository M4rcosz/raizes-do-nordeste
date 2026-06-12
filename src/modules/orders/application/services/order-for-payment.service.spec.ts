import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import Big from 'big.js';
import { OrderForPaymentService } from './order-for-payment.service';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import type { UpdateOrderStatusUseCase } from '../use-cases/update-order-status.use-case';
import { Order } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';
import { OrderChannel } from '../../domain/value-objects/order-channel';
import { OrderStatus } from '../../domain/value-objects/order-status';
import { InvalidOrderStatusTransitionError } from '../../domain/errors/invalid-order-status-transition.error';
import { OrderNotFoundError } from '../errors/order-not-found.error';
import { OrderStatusConflictError } from '../errors/order-status-conflict.error';

const makeOrder = (status: OrderStatus, customerId: string | null = 'c-1'): Order =>
  new Order(
    'o-1',
    'bu-1',
    customerId,
    null,
    0,
    0,
    new Big('25'),
    null,
    OrderChannel.APP,
    status,
    new Date(),
    new Date(),
    null,
    [new OrderItem('i-1', 'o-1', 'p-1', 1, new Big('25'), null)],
  );

describe('OrderForPaymentService', () => {
  let findById: jest.MockedFunction<OrderRepository['findById']>;
  let execute: jest.MockedFunction<UpdateOrderStatusUseCase['execute']>;
  let service: OrderForPaymentService;

  beforeEach(() => {
    findById = jest.fn() as jest.MockedFunction<OrderRepository['findById']>;
    execute = jest.fn() as jest.MockedFunction<UpdateOrderStatusUseCase['execute']>;

    const orders = {
      create: jest.fn(),
      findById,
      findMany: jest.fn(),
      updateStatus: jest.fn(),
    } as unknown as OrderRepository;
    const updateOrderStatus = { execute } as unknown as UpdateOrderStatusUseCase;

    service = new OrderForPaymentService(orders, updateOrderStatus);
  });

  describe('findForPayment', () => {
    it('maps the order to the payment view and marks PENDING orders as awaiting payment', async () => {
      findById.mockResolvedValue(makeOrder(OrderStatus.PENDING));

      const view = await service.findForPayment('o-1');

      expect(view).toEqual({
        id: 'o-1',
        isAwaitingPayment: true,
        totalAmount: '25.00',
        customerId: 'c-1',
      });
    });

    it('marks a non-PENDING order as not awaiting payment', async () => {
      findById.mockResolvedValue(makeOrder(OrderStatus.CONFIRMED));

      const view = await service.findForPayment('o-1');

      expect(view?.isAwaitingPayment).toBe(false);
    });

    it('returns null when the order does not exist', async () => {
      findById.mockResolvedValue(null);

      await expect(service.findForPayment('missing')).resolves.toBeNull();
    });
  });

  describe('confirmAfterPayment', () => {
    it('confirms the order and reports "confirmed", forwarding the tx and a null actor', async () => {
      execute.mockResolvedValue(makeOrder(OrderStatus.CONFIRMED));
      const tx = {} as unknown;

      await expect(service.confirmAfterPayment('o-1', tx)).resolves.toBe('confirmed');
      expect(execute).toHaveBeenCalledWith(
        { orderId: 'o-1', orderStatus: OrderStatus.CONFIRMED },
        null,
        tx,
      );
    });

    it.each([
      ['InvalidOrderStatusTransitionError', new InvalidOrderStatusTransitionError('past PENDING')],
      ['OrderStatusConflictError', new OrderStatusConflictError('lost the lock')],
      ['OrderNotFoundError', new OrderNotFoundError('gone')],
    ])('reports "not_confirmed" when the order moved on (%s)', async (_label, error) => {
      execute.mockRejectedValue(error);

      await expect(service.confirmAfterPayment('o-1')).resolves.toBe('not_confirmed');
    });

    it('rethrows unexpected errors', async () => {
      const boom = new Error('db down');
      execute.mockRejectedValue(boom);

      await expect(service.confirmAfterPayment('o-1')).rejects.toBe(boom);
    });
  });
});
