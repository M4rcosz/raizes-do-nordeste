import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { CancelOrderUseCase } from './cancel-order.use-case';
import { OrderNotFoundError } from '../errors/order-not-found.error';
import { OrderStatusConflictError } from '../errors/order-status-conflict.error';
import { OrderNotCancellableError } from '../../domain/errors/order-not-cancellable.error';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import { Order } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';
import { OrderChannel } from '../../domain/value-objects/order-channel';
import { OrderStatus } from '../../domain/value-objects/order-status';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import type { AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import type { StockRestoration } from '@modules/inventory/application/ports/stock-restoration.port';
import type { LoyaltyReversal } from '@modules/loyalty/application/ports/loyalty-reversal.port';
import type { PaymentRefund } from '@modules/payments/application/ports/payment-refund.port';
import type { TransactionRunner } from '@shared/transaction/transaction-runner.port';
import type { OrderActor } from '../order-actor';

const item = (productId: string, quantity: number): OrderItem =>
  new OrderItem('oi-1', 'o-1', productId, quantity, Money.fromDecimalString('10.00'), null);

const makeOrder = (
  status: OrderStatus,
  opts: { customerId?: string | null; pointsEarned?: number; pointsRedeemed?: number } = {},
): Order =>
  new Order(
    'o-1',
    'bu-1',
    opts.customerId === undefined ? 'c-1' : opts.customerId,
    null,
    opts.pointsRedeemed ?? 0,
    opts.pointsEarned ?? 0,
    Money.fromDecimalString('20.00'),
    null,
    OrderChannel.APP,
    status,
    new Date(),
    new Date(),
    null,
    [item('p-1', 2)],
  );

const staff: OrderActor = { id: 'staff-1', role: UserRole.MANAGER, businessUnitIds: ['bu-1'] };
const customer: OrderActor = { id: 'c-1', role: UserRole.CUSTOMER, businessUnitIds: [] };

describe('CancelOrderUseCase', () => {
  const tx = Symbol('tx');
  let findById: jest.MockedFunction<OrderRepository['findById']>;
  let updateStatus: jest.MockedFunction<OrderRepository['updateStatus']>;
  let restoreForOrder: jest.MockedFunction<StockRestoration['restoreForOrder']>;
  let reverseForOrder: jest.MockedFunction<LoyaltyReversal['reverseForOrder']>;
  let refundForOrder: jest.MockedFunction<PaymentRefund['refundForOrder']>;
  let log: jest.MockedFunction<AuditLogger['log']>;
  let useCase: CancelOrderUseCase;

  beforeEach(() => {
    findById = jest.fn() as jest.MockedFunction<OrderRepository['findById']>;
    updateStatus = jest.fn() as jest.MockedFunction<OrderRepository['updateStatus']>;
    restoreForOrder = jest.fn() as jest.MockedFunction<StockRestoration['restoreForOrder']>;
    restoreForOrder.mockResolvedValue(undefined);
    reverseForOrder = jest.fn() as jest.MockedFunction<LoyaltyReversal['reverseForOrder']>;
    reverseForOrder.mockResolvedValue(undefined);
    refundForOrder = jest.fn() as jest.MockedFunction<PaymentRefund['refundForOrder']>;
    refundForOrder.mockResolvedValue('no-payment');
    log = jest.fn() as jest.MockedFunction<AuditLogger['log']>;
    log.mockResolvedValue(undefined);

    const orders = {
      create: jest.fn(),
      findById,
      findMany: jest.fn(),
      updateStatus,
    } as unknown as OrderRepository;
    const transactions: TransactionRunner = { run: (work) => work(tx) };

    useCase = new CancelOrderUseCase(
      orders,
      transactions,
      { log } as AuditLogger,
      { restoreForOrder } as StockRestoration,
      { reverseForOrder } as LoyaltyReversal,
      { refundForOrder } as PaymentRefund,
    );
  });

  it('cancels a PENDING order: flips status, restocks, reverses loyalty and audits', async () => {
    findById.mockResolvedValue(makeOrder(OrderStatus.PENDING, { pointsRedeemed: 5 }));
    updateStatus.mockResolvedValue(makeOrder(OrderStatus.CANCELLED));

    const result = await useCase.execute('o-1', staff);

    expect(updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'o-1',
        expectedFrom: OrderStatus.PENDING,
        orderStatus: OrderStatus.CANCELLED,
        updatedById: 'staff-1',
      }),
      tx,
    );
    expect(restoreForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'o-1', items: [{ productId: 'p-1', quantity: 2 }] }),
      tx,
    );
    expect(reverseForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'c-1', pointsEarned: 0, pointsRedeemed: 5 }),
      tx,
    );
    expect(refundForOrder).toHaveBeenCalledWith('o-1');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTIONS.ORDER_CANCELLED, entityId: 'o-1' }),
    );
    expect(result.orderStatus).toBe(OrderStatus.CANCELLED);
  });

  it('lets staff cancel a CONFIRMED order (triggers the refund)', async () => {
    findById.mockResolvedValue(makeOrder(OrderStatus.CONFIRMED, { pointsEarned: 2 }));
    updateStatus.mockResolvedValue(makeOrder(OrderStatus.CANCELLED));
    refundForOrder.mockResolvedValue('refunded');

    await useCase.execute('o-1', staff);

    expect(reverseForOrder).toHaveBeenCalledWith(expect.objectContaining({ pointsEarned: 2 }), tx);
    expect(refundForOrder).toHaveBeenCalledWith('o-1');
  });

  it('cancels even when the refund fails (flagged for reconciliation, not raised)', async () => {
    findById.mockResolvedValue(makeOrder(OrderStatus.CONFIRMED, { pointsEarned: 2 }));
    updateStatus.mockResolvedValue(makeOrder(OrderStatus.CANCELLED));
    refundForOrder.mockResolvedValue('failed');

    const result = await useCase.execute('o-1', staff);

    expect(result.orderStatus).toBe(OrderStatus.CANCELLED);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ refund: 'failed' }) }),
    );
  });

  it('hides a foreign-unit order behind a 404 and never compensates', async () => {
    findById.mockResolvedValue(makeOrder(OrderStatus.PENDING));
    const foreign: OrderActor = { id: 's', role: UserRole.MANAGER, businessUnitIds: ['bu-2'] };

    await expect(useCase.execute('o-1', foreign)).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(updateStatus).not.toHaveBeenCalled();
    expect(refundForOrder).not.toHaveBeenCalled();
  });

  it('rejects cancelling past the window (PREPARING) and never compensates', async () => {
    findById.mockResolvedValue(makeOrder(OrderStatus.PREPARING));

    await expect(useCase.execute('o-1', staff)).rejects.toBeInstanceOf(OrderNotCancellableError);
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('lets a customer cancel their own PENDING order', async () => {
    findById.mockResolvedValue(makeOrder(OrderStatus.PENDING, { customerId: 'c-1' }));
    updateStatus.mockResolvedValue(makeOrder(OrderStatus.CANCELLED));

    const result = await useCase.execute('o-1', customer);

    expect(result.orderStatus).toBe(OrderStatus.CANCELLED);
  });

  it('forbids a customer from cancelling a CONFIRMED order (past their window)', async () => {
    findById.mockResolvedValue(makeOrder(OrderStatus.CONFIRMED, { customerId: 'c-1' }));

    await expect(useCase.execute('o-1', customer)).rejects.toBeInstanceOf(OrderNotCancellableError);
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('throws a conflict and rolls back when the status changed concurrently', async () => {
    findById.mockResolvedValue(makeOrder(OrderStatus.PENDING));
    updateStatus.mockResolvedValue(null); // optimistic guard matched no row

    await expect(useCase.execute('o-1', staff)).rejects.toBeInstanceOf(OrderStatusConflictError);
    // refund only runs after a committed cancellation.
    expect(refundForOrder).not.toHaveBeenCalled();
  });

  it('skips the loyalty reversal for an order with no customer', async () => {
    findById.mockResolvedValue(makeOrder(OrderStatus.PENDING, { customerId: null }));
    updateStatus.mockResolvedValue(makeOrder(OrderStatus.CANCELLED));

    await useCase.execute('o-1', staff);

    expect(reverseForOrder).not.toHaveBeenCalled();
  });

  it('throws OrderNotFoundError when the order does not exist', async () => {
    findById.mockResolvedValue(null);

    await expect(useCase.execute('o-1', staff)).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
