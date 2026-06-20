import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { CreatePaymentUseCase } from './create-payment.use-case';
import type { PaymentRepository } from '../../domain/repositories/payment.repository';
import type { PaymentGateway } from '../ports/payment-gateway.port';
import type { OrderForPayment } from '@modules/orders/application/ports/order-for-payment.port';
import type { AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { Payment } from '../../domain/entities/payment.entity';
import { PaymentMethod } from '../../domain/value-objects/payment-method';
import { PaymentStatus } from '../../domain/value-objects/payment-status';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { OrderNotFoundError } from '../errors/order-not-found.error';
import { OrderNotPayableError } from '../errors/order-not-payable.error';
import { PaymentChargeFailedError } from '../errors/payment-charge-failed.error';
import { PaymentGatewayError } from '../ports/payment-gateway.port';

const makePayment = (status: PaymentStatus): Payment =>
  new Payment(
    'pay-1',
    'order-1',
    Money.fromDecimalString('25.00'),
    PaymentMethod.PIX,
    status,
    status === PaymentStatus.PENDING ? null : 'tx-1',
    new Date(),
    new Date(),
  );

const payableOrder = {
  id: 'order-1',
  isAwaitingPayment: true,
  totalAmount: '25.00',
  customerId: 'cust-1',
};

/** The order's own customer - passes the ownership check. */
const owner = { id: 'cust-1', role: UserRole.CUSTOMER };

describe('CreatePaymentUseCase', () => {
  let payments: jest.Mocked<PaymentRepository>;
  let gateway: jest.Mocked<PaymentGateway>;
  let orders: jest.Mocked<OrderForPayment>;
  let audit: { log: jest.Mock };
  let useCase: CreatePaymentUseCase;

  beforeEach(() => {
    payments = {
      create: jest.fn(),
      findActiveByOrderId: jest.fn(),
      findCurrentByOrderId: jest.fn(),
      findByExtTransactionId: jest.fn(),
      markCharged: jest.fn(),
      updateStatus: jest.fn(),
    } as unknown as jest.Mocked<PaymentRepository>;
    gateway = { charge: jest.fn() } as unknown as jest.Mocked<PaymentGateway>;
    orders = {
      findForPayment: jest.fn(),
      confirmAfterPayment: jest.fn(),
    } as unknown as jest.Mocked<OrderForPayment>;
    audit = { log: jest.fn() };

    useCase = new CreatePaymentUseCase(payments, gateway, orders, audit as unknown as AuditLogger);
  });

  it('reserves a PENDING attempt, charges with its id as idempotency key, then marks it PROCESSING', async () => {
    orders.findForPayment.mockResolvedValue(payableOrder);
    payments.findActiveByOrderId.mockResolvedValue(null);
    payments.create.mockResolvedValue(makePayment(PaymentStatus.PENDING));
    gateway.charge.mockResolvedValue({
      extTransactionId: 'tx-1',
      status: PaymentStatus.APPROVED,
      raw: { ok: true },
    });
    payments.markCharged.mockResolvedValue(makePayment(PaymentStatus.PROCESSING));

    const result = await useCase.execute({ orderId: 'order-1', method: PaymentMethod.PIX }, owner);

    // Reserve happens before the charge, as a PENDING attempt with no ext id yet.
    expect(payments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        amount: '25.00',
        status: PaymentStatus.PENDING,
        extTransactionId: null,
      }),
    );
    // Amount is the order's total; the attempt id is the idempotency key.
    expect(gateway.charge).toHaveBeenCalledWith(expect.any(Money), {
      orderId: 'order-1',
      idempotencyKey: 'pay-1',
    });
    expect(gateway.charge.mock.calls[0][0].toDecimalString()).toBe('25.00');
    expect(payments.markCharged).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pay-1',
        status: PaymentStatus.PROCESSING,
        extTransactionId: 'tx-1',
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTIONS.PAYMENT_CREATED, entity: 'Payment' }),
    );
    expect(result.status).toBe(PaymentStatus.PROCESSING);
  });

  it('throws OrderNotFoundError when the order does not exist (404)', async () => {
    orders.findForPayment.mockResolvedValue(null);

    await expect(
      useCase.execute({ orderId: 'order-1', method: PaymentMethod.PIX }, owner),
    ).rejects.toBeInstanceOf(OrderNotFoundError);

    expect(payments.create).not.toHaveBeenCalled();
    expect(gateway.charge).not.toHaveBeenCalled();
  });

  it('hides another customer order behind the same 404, without reserving or charging', async () => {
    orders.findForPayment.mockResolvedValue(payableOrder); // owned by 'cust-1'

    await expect(
      useCase.execute(
        { orderId: 'order-1', method: PaymentMethod.PIX },
        { id: 'intruder', role: UserRole.CUSTOMER },
      ),
    ).rejects.toBeInstanceOf(OrderNotFoundError);

    expect(payments.create).not.toHaveBeenCalled();
    expect(gateway.charge).not.toHaveBeenCalled();
  });

  it('lets staff pay an order they do not own', async () => {
    orders.findForPayment.mockResolvedValue(payableOrder); // owned by 'cust-1'
    payments.findActiveByOrderId.mockResolvedValue(null);
    payments.create.mockResolvedValue(makePayment(PaymentStatus.PENDING));
    gateway.charge.mockResolvedValue({
      extTransactionId: 'tx-1',
      status: PaymentStatus.APPROVED,
      raw: {},
    });
    payments.markCharged.mockResolvedValue(makePayment(PaymentStatus.PROCESSING));

    await useCase.execute(
      { orderId: 'order-1', method: PaymentMethod.PIX },
      { id: 'attendant-9', role: UserRole.ATTENDANT },
    );

    expect(payments.create).toHaveBeenCalledTimes(1);
  });

  it('throws OrderNotPayableError when the order is not awaiting payment (422)', async () => {
    orders.findForPayment.mockResolvedValue({ ...payableOrder, isAwaitingPayment: false });

    await expect(
      useCase.execute({ orderId: 'order-1', method: PaymentMethod.PIX }, owner),
    ).rejects.toBeInstanceOf(OrderNotPayableError);

    expect(gateway.charge).not.toHaveBeenCalled();
  });

  it('throws OrderNotPayableError when a live attempt already exists, without charging (422)', async () => {
    orders.findForPayment.mockResolvedValue(payableOrder);
    payments.findActiveByOrderId.mockResolvedValue(makePayment(PaymentStatus.PROCESSING));

    await expect(
      useCase.execute({ orderId: 'order-1', method: PaymentMethod.PIX }, owner),
    ).rejects.toBeInstanceOf(OrderNotPayableError);

    expect(payments.create).not.toHaveBeenCalled();
    expect(gateway.charge).not.toHaveBeenCalled();
  });

  it('creates a fresh attempt when the only prior payment was refused (no live attempt)', async () => {
    orders.findForPayment.mockResolvedValue(payableOrder);
    payments.findActiveByOrderId.mockResolvedValue(null); // a REFUSED row is not "active"
    payments.create.mockResolvedValue(makePayment(PaymentStatus.PENDING));
    gateway.charge.mockResolvedValue({
      extTransactionId: 'tx-2',
      status: PaymentStatus.APPROVED,
      raw: {},
    });
    payments.markCharged.mockResolvedValue(makePayment(PaymentStatus.PROCESSING));

    await useCase.execute({ orderId: 'order-1', method: PaymentMethod.PIX }, owner);

    expect(payments.create).toHaveBeenCalledTimes(1);
    expect(gateway.charge).toHaveBeenCalledTimes(1);
  });

  it('records a reconciliation entry and rethrows when persisting PROCESSING fails after a charge', async () => {
    orders.findForPayment.mockResolvedValue(payableOrder);
    payments.findActiveByOrderId.mockResolvedValue(null);
    payments.create.mockResolvedValue(makePayment(PaymentStatus.PENDING));
    gateway.charge.mockResolvedValue({
      extTransactionId: 'tx-9',
      status: PaymentStatus.APPROVED,
      raw: {},
    });
    payments.markCharged.mockRejectedValue(new Error('db write failed'));

    await expect(
      useCase.execute({ orderId: 'order-1', method: PaymentMethod.PIX }, owner),
    ).rejects.toThrow('db write failed');

    // Hold the orphan's slot at PROCESSING so the sweeper can't free it and let a retry
    // double-charge (the sweeper only cancels PENDING reservations).
    expect(payments.updateStatus).toHaveBeenCalledWith({
      id: 'pay-1',
      status: PaymentStatus.PROCESSING,
    });

    // Charge succeeded but the write failed: flag the orphan for reconciliation
    // and never emit PAYMENT_CREATED.
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.PAYMENT_RECONCILE_REQUIRED,
        metadata: expect.objectContaining({ extTransactionId: 'tx-9' }),
      }),
    );
    expect(audit.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTIONS.PAYMENT_CREATED }),
    );
  });

  it('cancels the attempt and frees the slot on a definite gateway failure', async () => {
    orders.findForPayment.mockResolvedValue(payableOrder);
    payments.findActiveByOrderId.mockResolvedValue(null);
    payments.create.mockResolvedValue(makePayment(PaymentStatus.PENDING));
    gateway.charge.mockRejectedValue(new PaymentGatewayError('declined', false));

    await expect(
      useCase.execute({ orderId: 'order-1', method: PaymentMethod.PIX }, owner),
    ).rejects.toBeInstanceOf(PaymentChargeFailedError);

    // No money moved: free the slot so the order stays payable; no PROCESSING write, no audit.
    expect(payments.updateStatus).toHaveBeenCalledWith({
      id: 'pay-1',
      status: PaymentStatus.CANCELLED,
    });
    expect(payments.markCharged).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('holds the slot and flags reconciliation on an ambiguous gateway failure', async () => {
    orders.findForPayment.mockResolvedValue(payableOrder);
    payments.findActiveByOrderId.mockResolvedValue(null);
    payments.create.mockResolvedValue(makePayment(PaymentStatus.PENDING));
    gateway.charge.mockRejectedValue(new PaymentGatewayError('timeout', true));

    await expect(
      useCase.execute({ orderId: 'order-1', method: PaymentMethod.PIX }, owner),
    ).rejects.toMatchObject({ ambiguous: true });

    // Outcome unknown: keep it PROCESSING (slot held, sweeper-safe) and record reconciliation.
    expect(payments.updateStatus).toHaveBeenCalledWith({
      id: 'pay-1',
      status: PaymentStatus.PROCESSING,
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTIONS.PAYMENT_RECONCILE_REQUIRED }),
    );
    expect(payments.markCharged).not.toHaveBeenCalled();
  });

  it('treats an unexpected (non-gateway) error as ambiguous and holds the slot', async () => {
    orders.findForPayment.mockResolvedValue(payableOrder);
    payments.findActiveByOrderId.mockResolvedValue(null);
    payments.create.mockResolvedValue(makePayment(PaymentStatus.PENDING));
    gateway.charge.mockRejectedValue(new Error('boom'));

    await expect(
      useCase.execute({ orderId: 'order-1', method: PaymentMethod.PIX }, owner),
    ).rejects.toMatchObject({ ambiguous: true });

    expect(payments.updateStatus).toHaveBeenCalledWith({
      id: 'pay-1',
      status: PaymentStatus.PROCESSING,
    });
  });
});
