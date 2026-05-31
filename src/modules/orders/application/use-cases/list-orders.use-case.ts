import { Inject, Injectable } from '@nestjs/common';
import {
  ORDER_REPOSITORY,
  type OrderFilters,
  type OrderRepository,
} from '@modules/orders/domain/repositories/order.repository';
import { Order } from '@modules/orders/domain/entities/order.entity';
import { buildCursorMeta, type CursorPaginatedResult } from '@shared/pagination/pagination';
import { OrdersFetchError } from '../errors/orders-fetch.error';

export interface ListOrdersInput {
  filters?: OrderFilters;
  cursor?: string;
  limit: number;
}

@Injectable()
export class ListOrdersUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: OrderRepository,
  ) {}

  async execute(input: ListOrdersInput): Promise<CursorPaginatedResult<Order>> {
    const { filters, cursor, limit } = input;

    let items: Order[];
    try {
      // Fetch one extra row to know whether another page exists.
      items = await this.orders.findMany({
        filters,
        pagination: { cursor, take: limit + 1 },
      });
    } catch (err) {
      throw new OrdersFetchError('Could not retrieve orders.', { cause: err });
    }

    const hasMore = items.length > limit;
    const trimmed = hasMore ? items.slice(0, limit) : items;
    const lastItemId = trimmed[trimmed.length - 1]?.id;

    return {
      data: trimmed,
      meta: buildCursorMeta(limit, hasMore, lastItemId),
    };
  }
}
