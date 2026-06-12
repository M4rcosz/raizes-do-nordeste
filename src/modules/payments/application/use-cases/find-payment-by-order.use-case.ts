import { Inject, Injectable } from '@nestjs/common';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import {
  ORDER_FOR_PAYMENT,
  type OrderForPayment,
} from '@modules/orders/application/ports/order-for-payment.port';
import { Payment } from '../../domain/entities/payment.entity';
import {
  PAYMENT_REPOSITORY,
  type PaymentRepository,
} from '../../domain/repositories/payment.repository';
import { PaymentNotFoundError } from '../errors/payment-not-found.error';

/** The authenticated principal asking for the payment, resolved by the HTTP layer. */
export interface PaymentRequester {
  id: string;
  role: UserRole;
}

@Injectable()
export class FindPaymentByOrderUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepository,
    @Inject(ORDER_FOR_PAYMENT)
    private readonly orders: OrderForPayment,
  ) {}

  async execute(orderId: string, requester: PaymentRequester): Promise<Payment> {
    // Independent reads, so run them together.
    const [payment, order] = await Promise.all([
      this.payments.findCurrentByOrderId(orderId),
      this.orders.findForPayment(orderId),
    ]);

    // Customer sees only their own order's payment; staff sees any. Same 404 for missing
    // and not-yours, so existence is never leaked.
    const hiddenFromCustomer =
      requester.role === UserRole.CUSTOMER && order?.customerId !== requester.id;

    if (!payment || !order || hiddenFromCustomer) {
      throw new PaymentNotFoundError(`No payment was found for order ${orderId}.`);
    }

    return payment;
  }
}
