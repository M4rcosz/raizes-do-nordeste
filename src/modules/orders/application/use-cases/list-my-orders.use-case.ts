import { Inject, Injectable } from '@nestjs/common';
import {
  ORDER_REPOSITORY,
  type OrderKeyset,
  type OrderRepository,
} from '@modules/orders/domain/repositories/order.repository';
import { Order } from '@modules/orders/domain/entities/order.entity';
import type { OrderChannel } from '@modules/orders/domain/value-objects/order-channel';
import type { OrderStatus } from '@modules/orders/domain/value-objects/order-status';
import { buildCursorPage, type CursorPaginatedResult } from '@shared/pagination/pagination';
import { DEFAULT_ORDER_SORT } from '@modules/orders/domain/value-objects/order-sort';
import { OrdersFetchError } from '../errors/orders-fetch.error';
import { InvalidOrderCursorError } from '../errors/invalid-order-cursor.error';
import { decodeOrderCursor, encodeOrderCursor } from '../list-orders-cursor';
import { sortValueOf } from '../order-sort-value';

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

    // This listing has no sort parameter, so the token is always minted under the
    // default sort; decoding still rejects one forged for a different ordering.
    const keyset = cursor === undefined ? undefined : this.resolveKeyset(cursor);

    let items: Order[];
    try {
      // Fetch one extra row to know whether another page exists.
      items = await this.orders.findMany({
        filters: {
          customerId,
          orderChannel: filters?.orderChannel,
          orderStatus: filters?.orderStatus,
        },
        take: limit + 1,
        keyset,
        sort: DEFAULT_ORDER_SORT,
      });
    } catch (err) {
      throw new OrdersFetchError('Could not retrieve your orders.', { cause: err });
    }

    return buildCursorPage(items, limit, (order) =>
      encodeOrderCursor(order.id, sortValueOf(order, DEFAULT_ORDER_SORT.field), DEFAULT_ORDER_SORT),
    );
  }

  /**
   * Same keyset contract as ListOrdersUseCase: the token carries the full sort key so
   * the query compares values instead of seeking to a row. A customer's order can
   * transition status between two pages, and a positional cursor would then drop the
   * following order from their history entirely.
   */
  private resolveKeyset(cursor: string): OrderKeyset {
    const decoded = decodeOrderCursor(cursor);
    if (
      decoded.sortBy !== DEFAULT_ORDER_SORT.field ||
      decoded.sortDir !== DEFAULT_ORDER_SORT.direction
    ) {
      throw new InvalidOrderCursorError('Pagination cursor does not match the requested sort.');
    }
    return { sortValue: decoded.sortValue, id: decoded.id };
  }
}
