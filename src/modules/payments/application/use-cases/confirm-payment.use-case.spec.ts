import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import Big from 'big.js';
import { ConfirmPaymentUseCase } from './confirm-payment.use-case';
import type { PaymentRepository } from '../../domain/repositories/payment.repository';
import type {
  OrderForPayment,
  OrderForPaymentView,
} from '@modules/orders/application/ports/order-for-payment.port';
import type { LoyaltyEarning } from '@modules/loyalty/application/ports/loyalty-earning.port';
import type { AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import type { TransactionRunner } from '@shared/transaction/transaction-runner.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { Payment } from '../../domain/entities/payment.entity';
import { PaymentMethod } from '../../domain/value-objects/payment-method';
import { PaymentStatus } from '../../domain/value-objects/payment-status';

const TX = Symbol('tx');

const makePayment = (status: PaymentStatus): Payment =>
  new Payment(
    'pay-1',
    'order-1',
    new Big('25.00'),
    PaymentMethod.PIX,
    status,
    'tx-1',
    new Date(),
    new Date(),
  );

describe('ConfirmPaymentUseCase', () => {
  let payments: jest.Mocked<PaymentRepository>;
  let orders: jest.Mocked<OrderForPayment>;
  let transactions: TransactionRunner;
  let audit: { log: jest.Mock };
  let loyalty: jest.Mocked<LoyaltyEarning>;
  let useCase: ConfirmPaymentUseCase;

  const orderView = (customerId: string | null): OrderForPaymentView => ({
    id: 'order-1',
    isAwaitingPayment: true,
    totalAmount: '25.00',
    customerId,
  });

  beforeEach(() => {
    payments = {
      create: jest.fn(),
      findActiveByOrderId: jest.fn(),
      findCurrentByOrderId: jest.fn(),
      findByExtTransactionId: jest.fn(),
      markCharged: jest.fn(),
      updateStatus: jest.fn(),
      settle: jest.fn(),
    } as unknown as jest.Mocked<PaymentRepository>;
    orders = {
      findForPayment: jest.fn(),
      confirmAfterPayment: jest.fn(),
    } as unknown as jest.Mocked<OrderForPayment>;
    transactions = {
      run: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work(TX)),
    } as unknown as TransactionRunner;
    audit = { log: jest.fn() };
    loyalty = {
      earnForOrder: jest.fn(),
    } as unknown as jest.Mocked<LoyaltyEarning>;
    // The RN-31 customer lookup runs before the tx on every approval path.
    orders.findForPayment.mockResolvedValue(orderView('cust-1'));

    useCase = new ConfirmPaymentUseCase(
      payments,
      orders,
      transactions,
      audit as unknown as AuditLogger,
      loyalty,
    );
  });

  it('approves a payment, confirms the order in the same tx, and audits PAYMENT_APPROVED', async () => {
    payments.findByExtTransactionId.mockResolvedValue(makePayment(PaymentStatus.PROCESSING));
    payments.settle.mockResolvedValue(makePayment(PaymentStatus.APPROVED));
    orders.confirmAfterPayment.mockResolvedValue('confirmed');

    const result = await useCase.execute({
      extTransactionId: 'tx-1',
      status: PaymentStatus.APPROVED,
      amount: '25.00',
    });

    expect(payments.settle).toHaveBeenCalledWith(
      { id: 'pay-1', status: PaymentStatus.APPROVED },
      TX,
    );
    expect(orders.confirmAfterPayment).toHaveBeenCalledWith('order-1', TX);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTIONS.PAYMENT_APPROVED, entity: 'Payment' }),
    );
    expect(result?.status).toBe(PaymentStatus.APPROVED);
  });

  it('settles the payment but flags reconciliation when the order is no longer confirmable', async () => {
    payments.findByExtTransactionId.mockResolvedValue(makePayment(PaymentStatus.PROCESSING));
    payments.settle.mockResolvedValue(makePayment(PaymentStatus.APPROVED));
    orders.confirmAfterPayment.mockResolvedValue('not_confirmed');

    const result = await useCase.execute({
      extTransactionId: 'tx-1',
      status: PaymentStatus.APPROVED,
      amount: '25.00',
    });

    // Payment still settled (no rollback), plus a reconciliation audit entry.
    expect(payments.settle).toHaveBeenCalledWith(
      { id: 'pay-1', status: PaymentStatus.APPROVED },
      TX,
    );
    expect(result?.status).toBe(PaymentStatus.APPROVED);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTIONS.PAYMENT_APPROVED }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTIONS.PAYMENT_RECONCILE_REQUIRED }),
    );
  });

  it('refuses a payment without confirming the order, auditing PAYMENT_REFUSED', async () => {
    payments.findByExtTransactionId.mockResolvedValue(makePayment(PaymentStatus.PROCESSING));
    payments.settle.mockResolvedValue(makePayment(PaymentStatus.REFUSED));

    await useCase.execute({
      extTransactionId: 'tx-1',
      status: PaymentStatus.REFUSED,
      amount: '25.00',
    });

    expect(orders.confirmAfterPayment).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTIONS.PAYMENT_REFUSED }),
    );
  });

  it('acks an unknown transaction as a no-op and records reconciliation (no 404)', async () => {
    payments.findByExtTransactionId.mockResolvedValue(null);

    const result = await useCase.execute({
      extTransactionId: 'missing',
      status: PaymentStatus.APPROVED,
      amount: '25.00',
    });

    expect(result).toBeNull();
    expect(payments.settle).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTIONS.PAYMENT_RECONCILE_REQUIRED }),
    );
  });

  it('never settles when the webhook amount differs from the charged amount; flags reconciliation', async () => {
    payments.findByExtTransactionId.mockResolvedValue(makePayment(PaymentStatus.PROCESSING));

    const result = await useCase.execute({
      extTransactionId: 'tx-1',
      status: PaymentStatus.APPROVED,
      amount: '30.00',
    });

    expect(result).toBeNull();
    expect(payments.settle).not.toHaveBeenCalled();
    expect(orders.confirmAfterPayment).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTIONS.PAYMENT_RECONCILE_REQUIRED }),
    );
  });

  it('is idempotent: a payment already settled is returned unchanged (webhook redelivery)', async () => {
    payments.findByExtTransactionId.mockResolvedValue(makePayment(PaymentStatus.APPROVED));

    const result = await useCase.execute({
      extTransactionId: 'tx-1',
      status: PaymentStatus.APPROVED,
      amount: '25.00',
    });

    expect(result?.status).toBe(PaymentStatus.APPROVED);
    expect(payments.settle).not.toHaveBeenCalled();
    expect(orders.confirmAfterPayment).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('treats a concurrent redelivery (settle matched no row) as a no-op, returning the settled payment', async () => {
    // Still PROCESSING at the top check, but another delivery settles it first -> settle null.
    payments.findByExtTransactionId
      .mockResolvedValueOnce(makePayment(PaymentStatus.PROCESSING))
      .mockResolvedValueOnce(makePayment(PaymentStatus.APPROVED));
    payments.settle.mockResolvedValue(null);

    const result = await useCase.execute({
      extTransactionId: 'tx-1',
      status: PaymentStatus.APPROVED,
      amount: '25.00',
    });

    expect(result?.status).toBe(PaymentStatus.APPROVED);
    expect(orders.confirmAfterPayment).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  describe('loyalty earning (RN-31)', () => {
    it('credits points in the settlement tx when the payment approves and the order confirms', async () => {
      payments.findByExtTransactionId.mockResolvedValue(makePayment(PaymentStatus.PROCESSING));
      payments.settle.mockResolvedValue(makePayment(PaymentStatus.APPROVED));
      orders.confirmAfterPayment.mockResolvedValue('confirmed');

      await useCase.execute({
        extTransactionId: 'tx-1',
        status: PaymentStatus.APPROVED,
        amount: '25.00',
      });

      // payment.amount is the authoritative charged total handed to loyalty.
      expect(loyalty.earnForOrder).toHaveBeenCalledWith(
        { customerId: 'cust-1', orderId: 'order-1', totalAmount: '25.00' },
        TX,
      );
    });

    it('earns nothing when the order is no longer confirmable (e.g. cancelled)', async () => {
      payments.findByExtTransactionId.mockResolvedValue(makePayment(PaymentStatus.PROCESSING));
      payments.settle.mockResolvedValue(makePayment(PaymentStatus.APPROVED));
      orders.confirmAfterPayment.mockResolvedValue('not_confirmed');

      await useCase.execute({
        extTransactionId: 'tx-1',
        status: PaymentStatus.APPROVED,
        amount: '25.00',
      });

      expect(loyalty.earnForOrder).not.toHaveBeenCalled();
    });

    it('earns nothing on a refused payment (and never looks the customer up)', async () => {
      payments.findByExtTransactionId.mockResolvedValue(makePayment(PaymentStatus.PROCESSING));
      payments.settle.mockResolvedValue(makePayment(PaymentStatus.REFUSED));

      await useCase.execute({
        extTransactionId: 'tx-1',
        status: PaymentStatus.REFUSED,
        amount: '25.00',
      });

      expect(orders.findForPayment).not.toHaveBeenCalled();
      expect(loyalty.earnForOrder).not.toHaveBeenCalled();
    });

    it('earns nothing for an anonymous order (no customer attached)', async () => {
      payments.findByExtTransactionId.mockResolvedValue(makePayment(PaymentStatus.PROCESSING));
      payments.settle.mockResolvedValue(makePayment(PaymentStatus.APPROVED));
      orders.confirmAfterPayment.mockResolvedValue('confirmed');
      orders.findForPayment.mockResolvedValue(orderView(null));

      await useCase.execute({
        extTransactionId: 'tx-1',
        status: PaymentStatus.APPROVED,
        amount: '25.00',
      });

      expect(loyalty.earnForOrder).not.toHaveBeenCalled();
    });
  });
});
