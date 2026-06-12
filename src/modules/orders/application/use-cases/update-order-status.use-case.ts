import { Inject, Injectable } from '@nestjs/common';
import { Order } from '@modules/orders/domain/entities/order.entity';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@modules/orders/domain/repositories/order.repository';
import type { OrderStatus } from '@modules/orders/domain/value-objects/order-status';
import { AUDIT_LOGGER, type AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { OrderNotFoundError } from '../errors/order-not-found.error';
import { OrderStatusConflictError } from '../errors/order-status-conflict.error';

export interface UpdateOrderStatusCommand {
  orderId: string;
  orderStatus: OrderStatus;
}

@Injectable()
export class UpdateOrderStatusUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: OrderRepository,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(
    command: UpdateOrderStatusCommand,
    actorId: string | null,
    tx?: TransactionContext,
  ): Promise<Order> {
    // Read inside the caller's tx (when present) so this read and the write below share
    // one snapshot; the optimistic lock still guards the actual transition.
    const order = await this.orders.findById(command.orderId, tx);
    if (!order) {
      throw new OrderNotFoundError(`Order ${command.orderId} was not found.`);
    }

    // Domain guard: rejects invalid transitions (e.g. PENDING -> DELIVERED) with 422.
    order.assertCanTransitionTo(command.orderStatus);

    // Optimistic lock: the write only applies if the status we read still holds.
    // A null result means another request transitioned the order in between (409).
    const updated = await this.orders.updateStatus(
      {
        id: command.orderId,
        expectedFrom: order.orderStatus,
        orderStatus: command.orderStatus,
        updatedById: actorId,
      },
      tx,
    );

    if (!updated) {
      throw new OrderStatusConflictError(
        `Order ${command.orderId} changed status concurrently; expected ${order.orderStatus}.`,
      );
    }

    // Audit only when this use case owns the write. With an injected tx the change is not
    // durable until the caller commits, so logging here could record a transition that
    // later rolls back; the transactional caller owns post-commit auditing (the payment
    // confirm path is already captured by PAYMENT_APPROVED in ConfirmPaymentUseCase).
    if (!tx) {
      await this.audit.log({
        userId: actorId,
        action: AUDIT_ACTIONS.ORDER_STATUS_CHANGED,
        entity: 'Order',
        entityId: command.orderId,
        metadata: { from: order.orderStatus, to: command.orderStatus },
      });
    }

    return updated;
  }
}
