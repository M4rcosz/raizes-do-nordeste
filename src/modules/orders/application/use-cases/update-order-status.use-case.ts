import { Inject, Injectable } from '@nestjs/common';
import { Order } from '@modules/orders/domain/entities/order.entity';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@modules/orders/domain/repositories/order.repository';
import type { OrderStatus } from '@modules/orders/domain/value-objects/order-status';
import { AUDIT_LOGGER, type AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { OrderNotFoundError } from '../errors/order-not-found.error';

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

  async execute(command: UpdateOrderStatusCommand, actorId: string): Promise<Order> {
    const order = await this.orders.findById(command.orderId);
    if (!order) {
      throw new OrderNotFoundError(`Order ${command.orderId} was not found.`);
    }

    // Domain guard: rejects invalid transitions (e.g. PENDING -> DELIVERED) with 422.
    order.assertCanTransitionTo(command.orderStatus);

    const updated = await this.orders.updateStatus({
      id: command.orderId,
      orderStatus: command.orderStatus,
      updatedById: actorId,
    });

    await this.audit.log({
      userId: actorId,
      action: AUDIT_ACTIONS.ORDER_STATUS_CHANGED,
      entity: 'Order',
      entityId: command.orderId,
      metadata: { from: order.orderStatus, to: command.orderStatus },
    });

    return updated;
  }
}
