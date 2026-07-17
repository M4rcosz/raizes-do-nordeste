import { Inject, Injectable } from '@nestjs/common';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@modules/orders/domain/repositories/order.repository';
import type { Order } from '@modules/orders/domain/entities/order.entity';
import { actorCanAccessOrder } from '../order-actor';
import type { OrderAiActor, OrderForAi, OrderForAiView } from '../ports/order-for-ai.port';

@Injectable()
export class OrderForAiService implements OrderForAi {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: OrderRepository,
  ) {}

  async findByIdForActor(orderId: string, actor: OrderAiActor): Promise<OrderForAiView | null> {
    const order = await this.orders.findById(orderId);
    if (!order) {
      return null;
    }
    // Reuse the order visibility rule: a foreign order reads as if it does not exist.
    if (!actorCanAccessOrder({ id: actor.userId, ...actor }, order)) {
      return null;
    }
    return OrderForAiService.toView(order);
  }

  private static toView(order: Order): OrderForAiView {
    return {
      id: order.id,
      status: order.orderStatus,
      channel: order.orderChannel,
      businessUnitId: order.businessUnitId,
      customerId: order.customerId,
      total: order.totalAmount.toDecimalString(),
      createdAt: order.createdAt.toISOString(),
      items: order.orderItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toDecimalString(),
        subtotal: item.subtotal.toDecimalString(),
      })),
    };
  }
}
