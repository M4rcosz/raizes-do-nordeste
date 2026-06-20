import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { UpdateOrderStatusUseCase } from './update-order-status.use-case';
import { OrderNotFoundError } from '../errors/order-not-found.error';
import { OrderStatusConflictError } from '../errors/order-status-conflict.error';
import { InvalidOrderStatusTransitionError } from '../../domain/errors/invalid-order-status-transition.error';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import type { AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { Order } from '../../domain/entities/order.entity';
import { OrderChannel } from '../../domain/value-objects/order-channel';
import { OrderStatus } from '../../domain/value-objects/order-status';

const makeOrder = (status: OrderStatus): Order =>
  new Order(
    'o-1',
    'bu-1',
    'c-1',
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

describe('UpdateOrderStatusUseCase', () => {
  let findById: jest.MockedFunction<OrderRepository['findById']>;
  let updateStatus: jest.MockedFunction<OrderRepository['updateStatus']>;
  let log: jest.MockedFunction<AuditLogger['log']>;
  let useCase: UpdateOrderStatusUseCase;

  beforeEach(() => {
    findById = jest.fn() as jest.MockedFunction<OrderRepository['findById']>;
    updateStatus = jest.fn() as jest.MockedFunction<OrderRepository['updateStatus']>;
    log = jest.fn() as jest.MockedFunction<AuditLogger['log']>;
    log.mockResolvedValue(undefined);

    const repo = {
      create: jest.fn(),
      findById,
      findMany: jest.fn(),
      updateStatus,
    } as unknown as OrderRepository;
    const audit: AuditLogger = { log };

    useCase = new UpdateOrderStatusUseCase(repo, audit);
  });

  it('persists a valid transition and writes an audit entry', async () => {
    findById.mockResolvedValue(makeOrder(OrderStatus.PENDING));
    updateStatus.mockResolvedValue(makeOrder(OrderStatus.CONFIRMED));

    const result = await useCase.execute(
      { orderId: 'o-1', orderStatus: OrderStatus.CONFIRMED },
      'staff-1',
    );

    expect(updateStatus).toHaveBeenCalledWith(
      {
        id: 'o-1',
        expectedFrom: OrderStatus.PENDING,
        orderStatus: OrderStatus.CONFIRMED,
        updatedById: 'staff-1',
      },
      undefined,
    );
    expect(findById).toHaveBeenCalledWith('o-1', undefined);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.ORDER_STATUS_CHANGED,
        entity: 'Order',
        entityId: 'o-1',
        userId: 'staff-1',
        metadata: { from: OrderStatus.PENDING, to: OrderStatus.CONFIRMED },
      }),
    );
    expect(result.orderStatus).toBe(OrderStatus.CONFIRMED);
  });

  it('reads/writes inside an injected tx and defers auditing to the caller', async () => {
    findById.mockResolvedValue(makeOrder(OrderStatus.PENDING));
    updateStatus.mockResolvedValue(makeOrder(OrderStatus.CONFIRMED));
    const tx = {} as unknown; // opaque transaction context

    const result = await useCase.execute(
      { orderId: 'o-1', orderStatus: OrderStatus.CONFIRMED },
      null,
      tx,
    );

    expect(findById).toHaveBeenCalledWith('o-1', tx);
    expect(updateStatus).toHaveBeenCalledWith(
      {
        id: 'o-1',
        expectedFrom: OrderStatus.PENDING,
        orderStatus: OrderStatus.CONFIRMED,
        updatedById: null,
      },
      tx,
    );
    // With a tx the write is not durable yet, so the use case must not audit here.
    expect(log).not.toHaveBeenCalled();
    expect(result.orderStatus).toBe(OrderStatus.CONFIRMED);
  });

  it('rejects an invalid transition without persisting or auditing', async () => {
    findById.mockResolvedValue(makeOrder(OrderStatus.PENDING));

    await expect(
      useCase.execute({ orderId: 'o-1', orderStatus: OrderStatus.DELIVERED }, 'staff-1'),
    ).rejects.toBeInstanceOf(InvalidOrderStatusTransitionError);

    expect(updateStatus).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('throws OrderNotFoundError when the order does not exist', async () => {
    findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ orderId: 'o-1', orderStatus: OrderStatus.CONFIRMED }, 'staff-1'),
    ).rejects.toBeInstanceOf(OrderNotFoundError);

    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('throws OrderStatusConflictError when the status changed concurrently (null update)', async () => {
    findById.mockResolvedValue(makeOrder(OrderStatus.PENDING));
    // The optimistic update matched no row: another request already transitioned it.
    updateStatus.mockResolvedValue(null);

    await expect(
      useCase.execute({ orderId: 'o-1', orderStatus: OrderStatus.CONFIRMED }, 'staff-1'),
    ).rejects.toBeInstanceOf(OrderStatusConflictError);

    expect(log).not.toHaveBeenCalled();
  });
});
