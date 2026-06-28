import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { PaymentsController } from './payments.controller';
import { CreatePaymentUseCase } from '@modules/payments/application/use-cases/create-payment.use-case';
import { ConfirmPaymentUseCase } from '@modules/payments/application/use-cases/confirm-payment.use-case';
import { FindPaymentByOrderUseCase } from '@modules/payments/application/use-cases/find-payment-by-order.use-case';
import { Payment } from '@modules/payments/domain/entities/payment.entity';
import { PaymentMethod } from '@modules/payments/domain/value-objects/payment-method';
import { PaymentStatus } from '@modules/payments/domain/value-objects/payment-status';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';

const makePayment = (status: PaymentStatus = PaymentStatus.PROCESSING): Payment =>
  new Payment(
    'pay-1',
    'order-1',
    Money.fromDecimalString('25.00'),
    PaymentMethod.PIX,
    status,
    'tx-1',
    new Date(),
    new Date(),
  );

const user: JwtPayload = {
  sub: 'user-1',
  username: 'tester',
  role: UserRole.CUSTOMER,
  businessUnitId: 'bu-1',
  iat: 0,
  exp: 0,
};

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let createPayment: jest.Mocked<CreatePaymentUseCase>;
  let confirmPayment: jest.Mocked<ConfirmPaymentUseCase>;
  let findPaymentByOrder: jest.Mocked<FindPaymentByOrderUseCase>;

  beforeEach(() => {
    createPayment = { execute: jest.fn() } as unknown as jest.Mocked<CreatePaymentUseCase>;
    confirmPayment = { execute: jest.fn() } as unknown as jest.Mocked<ConfirmPaymentUseCase>;
    findPaymentByOrder = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<FindPaymentByOrderUseCase>;

    controller = new PaymentsController(createPayment, confirmPayment, findPaymentByOrder);
  });

  it('maps a created payment to a response dto with money as a string', async () => {
    createPayment.execute.mockResolvedValue(makePayment());

    const result = await controller.create({ orderId: 'order-1', method: PaymentMethod.PIX }, user);

    expect(createPayment.execute).toHaveBeenCalledWith(
      { orderId: 'order-1', method: PaymentMethod.PIX },
      { id: 'user-1', role: UserRole.CUSTOMER },
    );
    expect(result.amount).toBe('25.00');
    expect(result.status).toBe(PaymentStatus.PROCESSING);
  });

  it('acks the webhook with 200 and forwards the fields to confirm', async () => {
    confirmPayment.execute.mockResolvedValue(makePayment(PaymentStatus.APPROVED));

    const result = await controller.webhook({
      extTransactionId: 'tx-1',
      status: PaymentStatus.APPROVED,
      amount: '25.00',
    });

    expect(confirmPayment.execute).toHaveBeenCalledWith({
      extTransactionId: 'tx-1',
      status: PaymentStatus.APPROVED,
      amount: '25.00',
    });
    // The gateway gets a uniform ack, never our internal payment representation.
    expect(result).toEqual({ received: true });
  });

  it('returns a payment by order id, passing the requester through', async () => {
    findPaymentByOrder.execute.mockResolvedValue(makePayment(PaymentStatus.APPROVED));

    const result = await controller.findByOrder({ orderId: 'order-1' }, user);

    expect(findPaymentByOrder.execute).toHaveBeenCalledWith('order-1', {
      id: 'user-1',
      role: UserRole.CUSTOMER,
    });
    expect(result.orderId).toBe('order-1');
  });
});
