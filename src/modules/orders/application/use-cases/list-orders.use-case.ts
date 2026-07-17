import { Inject, Injectable } from '@nestjs/common';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@modules/orders/domain/repositories/order.repository';
import { Order } from '@modules/orders/domain/entities/order.entity';
import type { OrderChannel } from '@modules/orders/domain/value-objects/order-channel';
import type { OrderStatus } from '@modules/orders/domain/value-objects/order-status';
import {
  DEFAULT_ORDER_SORT,
  type OrderSort,
} from '@modules/orders/domain/value-objects/order-sort';
import { buildCursorPage, type CursorPaginatedResult } from '@shared/pagination/pagination';
import { OrdersFetchError } from '../errors/orders-fetch.error';
import { InvalidOrderCursorError } from '../errors/invalid-order-cursor.error';
import { decodeOrderCursor, encodeOrderCursor } from '../list-orders-cursor';
import { resolveOrderUnitScope, type OrderActor } from '../order-actor';

/** Caller-supplied filters off the query string; businessUnitId narrows within the actor's scope. */
export interface ListOrdersUserFilters {
  businessUnitId?: string;
  orderChannel?: OrderChannel;
  orderStatus?: OrderStatus;
  attendantId?: string;
  customerId?: string;
  createdAtFrom?: Date;
  createdAtTo?: Date;
  /** Decimal strings; money never becomes a number on the way to the repository. */
  minTotal?: string;
  maxTotal?: string;
}

export interface ListOrdersInput {
  filters?: ListOrdersUserFilters;
  cursor?: string;
  limit: number;
  sort?: OrderSort;
  actor: OrderActor;
}

@Injectable()
export class ListOrdersUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: OrderRepository,
  ) {}

  async execute(input: ListOrdersInput): Promise<CursorPaginatedResult<Order>> {
    const { filters, cursor, limit, actor } = input;
    const sort = input.sort ?? DEFAULT_ORDER_SORT;

    // Clamp the listing to the units the actor is allowed to see before it reaches
    // the repo, so an attacker cannot widen visibility through the query string.
    // Every filter below is an extra AND-term on this already-clamped set.
    const businessUnitIds = resolveOrderUnitScope(actor, filters?.businessUnitId);

    const cursorId = cursor === undefined ? undefined : this.resolveCursorId(cursor, sort);

    let items: Order[];
    try {
      // Fetch one extra row to know whether another page exists.
      items = await this.orders.findMany({
        filters: {
          businessUnitIds,
          orderChannel: filters?.orderChannel,
          orderStatus: filters?.orderStatus,
          attendantId: filters?.attendantId,
          customerId: filters?.customerId,
          createdAtFrom: filters?.createdAtFrom,
          createdAtTo: filters?.createdAtTo,
          minTotal: filters?.minTotal,
          maxTotal: filters?.maxTotal,
        },
        pagination: { cursor: cursorId, take: limit + 1 },
        sort,
      });
    } catch (err) {
      throw new OrdersFetchError('Could not retrieve orders.', { cause: err });
    }

    return buildCursorPage(items, limit, (order) => encodeOrderCursor(order.id, sort));
  }

  /**
   * A cursor only identifies a position within the sort it was minted under. Replayed
   * against a different sort it would yield a wrong page, so we reject instead of
   * silently restarting at page 1, which the client would read as a working sort.
   */
  private resolveCursorId(cursor: string, sort: OrderSort): string {
    const decoded = decodeOrderCursor(cursor);
    if (decoded.sortBy !== sort.field || decoded.sortDir !== sort.direction) {
      throw new InvalidOrderCursorError('Pagination cursor does not match the requested sort.');
    }
    return decoded.id;
  }
}
