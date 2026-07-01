import { Inject, Injectable } from '@nestjs/common';
import { Order } from '@modules/orders/domain/entities/order.entity';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@modules/orders/domain/repositories/order.repository';
import { OrderStatus } from '@modules/orders/domain/value-objects/order-status';
import { OrderNotCancellableError } from '@modules/orders/domain/errors/order-not-cancellable.error';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@shared/transaction/transaction-runner.port';
import { AUDIT_LOGGER, type AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import {
  STOCK_RESTORATION,
  type StockRestoration,
} from '@modules/inventory/application/ports/stock-restoration.port';
import {
  LOYALTY_REVERSAL,
  type LoyaltyReversal,
} from '@modules/loyalty/application/ports/loyalty-reversal.port';
import {
  PAYMENT_REFUND,
  type PaymentRefund,
} from '@modules/payments/application/ports/payment-refund.port';
import { OrderNotFoundError } from '../errors/order-not-found.error';
import { OrderStatusConflictError } from '../errors/order-status-conflict.error';
import { actorCanAccessOrder, type OrderActor } from '../order-actor';

/**
 * Cancels an order and runs its compensations (RN-cancel). A staff member of the order's
 * unit may cancel while PENDING or CONFIRMED; a customer only their own order while PENDING.
 *
 * The DB-local compensations - status -> CANCELLED (optimistically locked), stock restock
 * and the loyalty reversal - commit together in one transaction. The payment refund is an
 * external gateway call, so it runs AFTER the commit and never blocks the cancellation: a
 * failed refund is flagged for reconciliation by the payments context.
 */
@Injectable()
export class CancelOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: OrderRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
    @Inject(STOCK_RESTORATION)
    private readonly stockRestoration: StockRestoration,
    @Inject(LOYALTY_REVERSAL)
    private readonly loyaltyReversal: LoyaltyReversal,
    @Inject(PAYMENT_REFUND)
    private readonly paymentRefund: PaymentRefund,
  ) {}

  async execute(orderId: string, actor: OrderActor): Promise<Order> {
    const order = await this.orders.findById(orderId);

    // Same 404 for missing and not-visible, so existence never leaks to a foreign actor.
    if (!order || !actorCanAccessOrder(actor, order)) {
      throw new OrderNotFoundError(`Order ${orderId} was not found.`);
    }

    this.assertCancellable(order, actor);

    const cancelled = await this.transactions.run(async (tx) => {
      // Optimistic lock: only flips if the status we read still holds. A null result means
      // another request transitioned the order in between (e.g. CONFIRMED -> PREPARING).
      const updated = await this.orders.updateStatus(
        {
          id: orderId,
          expectedFrom: order.orderStatus,
          orderStatus: OrderStatus.CANCELLED,
          updatedById: actor.id,
        },
        tx,
      );
      if (!updated) {
        throw new OrderStatusConflictError(
          `Order ${orderId} changed status concurrently; expected ${order.orderStatus}.`,
        );
      }

      // Compensations in the same tx: a failure rolls back the cancellation entirely.
      await this.stockRestoration.restoreForOrder(
        {
          businessUnitId: order.businessUnitId,
          orderId,
          actorId: actor.id,
          items: order.orderItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
        tx,
      );

      if (order.customerId) {
        await this.loyaltyReversal.reverseForOrder(
          {
            customerId: order.customerId,
            orderId,
            pointsEarned: order.pointsEarned,
            pointsRedeemed: order.pointsRedeemed,
          },
          tx,
        );
      }

      return updated;
    });

    // External refund after the commit; a failure is flagged for reconciliation, not raised.
    const refund = await this.paymentRefund.refundForOrder(orderId);

    await this.audit.log({
      userId: actor.id,
      action: AUDIT_ACTIONS.ORDER_CANCELLED,
      entity: 'Order',
      entityId: orderId,
      metadata: { from: order.orderStatus, refund },
    });

    return cancelled;
  }

  /** Enforces the cancellation window: PENDING/CONFIRMED for staff, PENDING only for a customer. */
  private assertCancellable(order: Order, actor: OrderActor): void {
    const withinWindow =
      order.orderStatus === OrderStatus.PENDING || order.orderStatus === OrderStatus.CONFIRMED;
    if (!withinWindow) {
      throw new OrderNotCancellableError(
        `Order ${order.id} cannot be cancelled in status ${order.orderStatus}.`,
      );
    }
    if (actor.role === UserRole.CUSTOMER && order.orderStatus !== OrderStatus.PENDING) {
      throw new OrderNotCancellableError(
        'A customer can only cancel an order before it is confirmed.',
      );
    }
  }
}
