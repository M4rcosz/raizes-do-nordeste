import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { RefundPaymentForOrderUseCase } from './refund-payment-for-order.use-case';
import type { PaymentRepository } from '../../domain/repositories/payment.repository';
import type { PaymentGateway } from '../ports/payment-gateway.port';
import { PaymentGatewayError } from '../ports/payment-gateway.port';
import type { AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { Payment } from '../../domain/entities/payment.entity';
import { PaymentStatus } from '../../domain/value-objects/payment-status';
import { PaymentMethod } from '../../domain/value-objects/payment-method';

const payment = (status: PaymentStatus, extTransactionId: string | null): Payment =>
  new Payment(
    'pay-1',
    'o-1',
    Money.fromDecimalString('20.00'),
    PaymentMethod.PIX,
    status,
    extTransactionId,
    new Date(),
    new Date(),
  );

describe('RefundPaymentForOrderUseCase', () => {
  let findActiveByOrderId: jest.MockedFunction<PaymentRepository['findActiveByOrderId']>;
  let updateStatus: jest.MockedFunction<PaymentRepository['updateStatus']>;
  let refund: jest.MockedFunction<PaymentGateway['refund']>;
  let log: jest.MockedFunction<AuditLogger['log']>;
  let useCase: RefundPaymentForOrderUseCase;

  beforeEach(() => {
    findActiveByOrderId = jest.fn() as jest.MockedFunction<
      PaymentRepository['findActiveByOrderId']
    >;
    updateStatus = jest.fn() as jest.MockedFunction<PaymentRepository['updateStatus']>;
    updateStatus.mockResolvedValue(payment(PaymentStatus.REFUNDED, 'mock_tx'));
    refund = jest.fn() as jest.MockedFunction<PaymentGateway['refund']>;
    log = jest.fn() as jest.MockedFunction<AuditLogger['log']>;
    log.mockResolvedValue(undefined);

    const payments = { findActiveByOrderId, updateStatus } as unknown as PaymentRepository;
    const gateway = { refund } as unknown as PaymentGateway;
    const audit: AuditLogger = { log };

    useCase = new RefundPaymentForOrderUseCase(payments, gateway, audit);
  });

  it('returns no-payment when the order has no settled charge', async () => {
    findActiveByOrderId.mockResolvedValue(null);

    await expect(useCase.refundForOrder('o-1')).resolves.toBe('no-payment');
    expect(refund).not.toHaveBeenCalled();
  });

  it('does not refund a still-pending attempt', async () => {
    findActiveByOrderId.mockResolvedValue(payment(PaymentStatus.PENDING, null));

    await expect(useCase.refundForOrder('o-1')).resolves.toBe('no-payment');
    expect(refund).not.toHaveBeenCalled();
  });

  it('refunds an approved charge, marks it REFUNDED and audits', async () => {
    findActiveByOrderId.mockResolvedValue(payment(PaymentStatus.APPROVED, 'mock_tx'));
    refund.mockResolvedValue({ extRefundId: 'r-1', raw: {} });

    await expect(useCase.refundForOrder('o-1')).resolves.toBe('refunded');

    expect(refund).toHaveBeenCalledWith({ extTransactionId: 'mock_tx', orderId: 'o-1' });
    expect(updateStatus).toHaveBeenCalledWith({ id: 'pay-1', status: PaymentStatus.REFUNDED });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTIONS.PAYMENT_REFUNDED, entityId: 'pay-1' }),
    );
  });

  it('flags reconciliation and returns failed when the gateway refund throws, never marking REFUNDED', async () => {
    findActiveByOrderId.mockResolvedValue(payment(PaymentStatus.APPROVED, 'mock_tx'));
    refund.mockRejectedValue(new PaymentGatewayError('refund down', true));

    await expect(useCase.refundForOrder('o-1')).resolves.toBe('failed');

    expect(updateStatus).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.PAYMENT_RECONCILE_REQUIRED,
        entityId: 'pay-1',
      }),
    );
  });
});
