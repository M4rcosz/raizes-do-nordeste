import { Inject, Injectable } from '@nestjs/common';
import { Order } from '@modules/orders/domain/entities/order.entity';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@modules/orders/domain/repositories/order.repository';
import { OrderNotFoundError } from '../errors/order-not-found.error';
import { actorCanAccessOrder, type OrderActor } from '../order-actor';

@Injectable()
export class FindOrderByIdUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: OrderRepository,
  ) {}

  async execute(id: string, requester: OrderActor): Promise<Order> {
    const order = await this.orders.findById(id);

    // Customer sees only their own orders; staff only orders of a unit in their claim;
    // ADMIN any. Same 404 for missing and not-visible, so existence is never leaked.
    if (!order || !actorCanAccessOrder(requester, order)) {
      throw new OrderNotFoundError(`Order ${id} was not found.`);
    }

    return order;
  }
}
