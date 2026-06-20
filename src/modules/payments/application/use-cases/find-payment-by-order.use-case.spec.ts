import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { FindPaymentByOrderUseCase } from './find-payment-by-order.use-case';
import type { PaymentRepository } from '../../domain/repositories/payment.repository';
import type { OrderForPayment } from '@modules/orders/application/ports/order-for-payment.port';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { Payment } from '../../domain/entities/payment.entity';
import { PaymentMethod } from '../../domain/value-objects/payment-method';
import { PaymentStatus } from '../../domain/value-objects/payment-status';
import { PaymentNotFoundError } from '../errors/payment-not-found.error';

const makePayment = (): Payment =>
  new Payment(
    'pay-1',
    'order-1',
    Money.fromDecimalString('25.00'),
    PaymentMethod.PIX,
    PaymentStatus.APPROVED,
    'tx-1',
    new Date(),
    new Date(),
  );

const orderView = {
  id: 'order-1',
  isAwaitingPayment: false,
  totalAmount: '25.00',
  customerId: 'cust-1',
};

describe('FindPaymentByOrderUseCase', () => {
  let payments: jest.Mocked<PaymentRepository>;
  let orders: jest.Mocked<OrderForPayment>;
  let useCase: FindPaymentByOrderUseCase;

  beforeEach(() => {
    payments = {
      create: jest.fn(),
      findActiveByOrderId: jest.fn(),
      findCurrentByOrderId: jest.fn(),
      findByExtTransactionId: jest.fn(),
      markCharged: jest.fn(),
      updateStatus: jest.fn(),
    } as unknown as jest.Mocked<PaymentRepository>;
    orders = {
      findForPayment: jest.fn(),
      confirmAfterPayment: jest.fn(),
    } as unknown as jest.Mocked<OrderForPayment>;

    useCase = new FindPaymentByOrderUseCase(payments, orders);
  });

  it('returns the payment to the order owner', async () => {
    payments.findCurrentByOrderId.mockResolvedValue(makePayment());
    orders.findForPayment.mockResolvedValue(orderView);

    const result = await useCase.execute('order-1', { id: 'cust-1', role: UserRole.CUSTOMER });

    expect(result.id).toBe('pay-1');
  });

  it('returns the payment to staff regardless of ownership', async () => {
    payments.findCurrentByOrderId.mockResolvedValue(makePayment());
    orders.findForPayment.mockResolvedValue(orderView);

    const result = await useCase.execute('order-1', { id: 'staff-1', role: UserRole.MANAGER });

    expect(result.id).toBe('pay-1');
  });

  it('hides another customer payment with a 404', async () => {
    payments.findCurrentByOrderId.mockResolvedValue(makePayment());
    orders.findForPayment.mockResolvedValue(orderView);

    await expect(
      useCase.execute('order-1', { id: 'intruder', role: UserRole.CUSTOMER }),
    ).rejects.toBeInstanceOf(PaymentNotFoundError);
  });

  it('throws PaymentNotFoundError when the order has no payment (404)', async () => {
    payments.findCurrentByOrderId.mockResolvedValue(null);
    orders.findForPayment.mockResolvedValue(orderView);

    await expect(
      useCase.execute('order-1', { id: 'cust-1', role: UserRole.CUSTOMER }),
    ).rejects.toBeInstanceOf(PaymentNotFoundError);
  });
});
