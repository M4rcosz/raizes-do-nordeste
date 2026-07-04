import { Inject, Injectable } from '@nestjs/common';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@modules/orders/domain/repositories/order.repository';
import { Order } from '@modules/orders/domain/entities/order.entity';
import type { OrderChannel } from '@modules/orders/domain/value-objects/order-channel';
import type { OrderStatus } from '@modules/orders/domain/value-objects/order-status';
import { buildCursorPage, type CursorPaginatedResult } from '@shared/pagination/pagination';
import { OrdersFetchError } from '../errors/orders-fetch.error';

/** Optional narrowing a customer may apply on top of the forced customerId scope. */
export interface ListMyOrdersFilters {
  orderChannel?: OrderChannel;
  orderStatus?: OrderStatus;
}

export interface ListMyOrdersInput {
  /** Always the authenticated customer's id; set by the controller from the JWT. */
  customerId: string;
  filters?: ListMyOrdersFilters;
  cursor?: string;
  limit: number;
}

/**
 * A customer's own order history. Visibility is scoped by customerId (never by
 * unit): the id is bound to the JWT subject in the controller, so a customer can
 * only ever list their own orders regardless of what they send.
 */
@Injectable()
export class ListMyOrdersUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: OrderRepository,
  ) {}

  async execute(input: ListMyOrdersInput): Promise<CursorPaginatedResult<Order>> {
    const { customerId, filters, cursor, limit } = input;

    let items: Order[];
    try {
      // Fetch one extra row to know whether another page exists.
      items = await this.orders.findMany({
        filters: {
          customerId,
          orderChannel: filters?.orderChannel,
          orderStatus: filters?.orderStatus,
        },
        pagination: { cursor, take: limit + 1 },
      });
    } catch (err) {
      throw new OrdersFetchError('Could not retrieve your orders.', { cause: err });
    }

    return buildCursorPage(items, limit);
  }
}
