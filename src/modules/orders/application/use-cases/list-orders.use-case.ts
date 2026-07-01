import { Inject, Injectable } from '@nestjs/common';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@modules/orders/domain/repositories/order.repository';
import { Order } from '@modules/orders/domain/entities/order.entity';
import type { OrderChannel } from '@modules/orders/domain/value-objects/order-channel';
import type { OrderStatus } from '@modules/orders/domain/value-objects/order-status';
import { buildCursorMeta, type CursorPaginatedResult } from '@shared/pagination/pagination';
import { OrdersFetchError } from '../errors/orders-fetch.error';
import { resolveOrderUnitScope, type OrderActor } from '../order-actor';

/** Caller-supplied filters off the query string; businessUnitId narrows within the actor's scope. */
export interface ListOrdersUserFilters {
  businessUnitId?: string;
  orderChannel?: OrderChannel;
  orderStatus?: OrderStatus;
}

export interface ListOrdersInput {
  filters?: ListOrdersUserFilters;
  cursor?: string;
  limit: number;
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

    // Clamp the listing to the units the actor is allowed to see before it reaches
    // the repo, so an attacker cannot widen visibility through the query string.
    const businessUnitIds = resolveOrderUnitScope(actor, filters?.businessUnitId);

    let items: Order[];
    try {
      // Fetch one extra row to know whether another page exists.
      items = await this.orders.findMany({
        filters: {
          businessUnitIds,
          orderChannel: filters?.orderChannel,
          orderStatus: filters?.orderStatus,
        },
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
