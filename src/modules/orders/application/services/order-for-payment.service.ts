import { Inject, Injectable } from '@nestjs/common';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@modules/orders/domain/repositories/order.repository';
import { OrderStatus } from '@modules/orders/domain/value-objects/order-status';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { UpdateOrderStatusUseCase } from '../use-cases/update-order-status.use-case';
import { InvalidOrderStatusTransitionError } from '@modules/orders/domain/errors/invalid-order-status-transition.error';
import { OrderNotFoundError } from '../errors/order-not-found.error';
import { OrderStatusConflictError } from '../errors/order-status-conflict.error';
import type {
  OrderConfirmOutcome,
  OrderForPayment,
  OrderForPaymentView,
} from '../ports/order-for-payment.port';

@Injectable()
export class OrderForPaymentService implements OrderForPayment {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: OrderRepository,
    private readonly updateOrderStatus: UpdateOrderStatusUseCase,
  ) {}

  async findForPayment(orderId: string): Promise<OrderForPaymentView | null> {
    const order = await this.orders.findById(orderId);
    if (!order) {
      return null;
    }

    return {
      id: order.id,
      isAwaitingPayment: order.orderStatus === OrderStatus.PENDING,
      totalAmount: order.totalAmount.toDecimalString(),
      customerId: order.customerId,
    };
  }

  async confirmAfterPayment(
    orderId: string,
    tx?: TransactionContext,
  ): Promise<OrderConfirmOutcome> {
    // System-driven transition (no acting user): the optimistic lock still guards it.
    try {
      await this.updateOrderStatus.execute(
        { orderId, orderStatus: OrderStatus.CONFIRMED },
        null,
        tx,
      );
      return 'confirmed';
    } catch (err) {
      // The order moved on between charge and webhook: already past PENDING
      // (InvalidOrderStatusTransition), lost the lock (Conflict), or gone (NotFound).
      // Swallow it so the payment settlement is not rolled back; the caller logs it
      // for reconciliation.
      if (
        err instanceof InvalidOrderStatusTransitionError ||
        err instanceof OrderStatusConflictError ||
        err instanceof OrderNotFoundError
      ) {
        return 'not_confirmed';
      }
      throw err;
    }
  }
}
