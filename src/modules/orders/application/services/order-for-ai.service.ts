import { Inject, Injectable } from '@nestjs/common';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@modules/orders/domain/repositories/order.repository';
import type { Order } from '@modules/orders/domain/entities/order.entity';
import type { OrderFilters } from '@modules/orders/domain/repositories/order.repository';
import { OrderChannel } from '@modules/orders/domain/value-objects/order-channel';
import { OrderStatus } from '@modules/orders/domain/value-objects/order-status';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { buildCursorPage } from '@shared/pagination/pagination';
import { actorCanAccessOrder, resolveOrderUnitScope, type OrderActor } from '../order-actor';
import type {
  OrderAiActor,
  OrderForAi,
  OrderForAiView,
  OrderListForAiFilters,
  OrderListForAiResult,
} from '../ports/order-for-ai.port';

// Rows one AI listing may return. Small on purpose: every row is tokens metered
// against the caller's AI balance, and the assistant is meant to answer a question,
// not dump a table. Truncation is surfaced via hasMore.
const AI_PAGE_SIZE = 10;

/**
 * Adapts the AI actor into the shape the orders visibility rules take. Written field
 * by field rather than spread: `{ id: actor.userId, ...actor }` only produced the
 * right result because OrderAiActor happens to have no `id` key, and adding one later
 * would silently overwrite the identity being forced here.
 */
function toOrderActor(actor: OrderAiActor): OrderActor {
  return { id: actor.userId, role: actor.role, businessUnitIds: actor.businessUnitIds };
}

/**
 * Narrow a model-supplied string to a channel this context knows, or drop it. The
 * value comes from an LLM, so an invented one is expected rather than exceptional:
 * dropping it removes the filter (a wider, harmless result) instead of reaching the
 * query and failing.
 */
function isOrderChannel(value: string): value is OrderChannel {
  return Object.values(OrderChannel).some((channel) => channel === value);
}

function asOrderChannel(value: string | undefined): OrderChannel | undefined {
  return value !== undefined && isOrderChannel(value) ? value : undefined;
}

/** Same as asOrderChannel, for the status. */
function isOrderStatus(value: string): value is OrderStatus {
  return Object.values(OrderStatus).some((status) => status === value);
}

function asOrderStatus(value: string | undefined): OrderStatus | undefined {
  return value !== undefined && isOrderStatus(value) ? value : undefined;
}

@Injectable()
export class OrderForAiService implements OrderForAi {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: OrderRepository,
  ) {}

  async listForActor(
    filters: OrderListForAiFilters,
    actor: OrderAiActor,
  ): Promise<OrderListForAiResult> {
    const scope = OrderForAiService.resolveScope(filters, actor);
    // Fetch one extra row to know whether another page exists.
    const items = await this.orders.findMany({
      filters: {
        orderChannel: asOrderChannel(filters.orderChannel),
        orderStatus: asOrderStatus(filters.orderStatus),
        createdAtFrom: filters.createdAtFrom,
        createdAtTo: filters.createdAtTo,
        // Spread LAST on purpose: the authorization scope must win over anything the
        // model supplied. Today no key collides, so order does not matter - but if
        // OrderFilters ever gains a field a tool arg also names, spreading first
        // would let a model argument silently overwrite the scope.
        ...scope,
      },
      take: AI_PAGE_SIZE + 1,
    });
    const page = buildCursorPage(items, AI_PAGE_SIZE);
    return {
      orders: page.data.map((order) => OrderForAiService.toView(order)),
      hasMore: page.meta.hasMore,
    };
  }

  /**
   * The visibility clamp, mirroring the two HTTP listing paths. A CUSTOMER is scoped
   * by customerId and NOT by unit (as ListMyOrdersUseCase does): customers carry no
   * unit claim, so running them through resolveOrderUnitScope would hand the repo an
   * empty businessUnitIds array, which matches nothing and would hide every order
   * they own. Staff and ADMIN go through resolveOrderUnitScope (as ListOrdersUseCase
   * does), where a requested unit can only narrow within the claim.
   */
  private static resolveScope(filters: OrderListForAiFilters, actor: OrderAiActor): OrderFilters {
    if (actor.role === UserRole.CUSTOMER) {
      return { customerId: actor.userId };
    }
    return {
      businessUnitIds: resolveOrderUnitScope(toOrderActor(actor), filters.businessUnitId),
    };
  }

  async findByIdForActor(orderId: string, actor: OrderAiActor): Promise<OrderForAiView | null> {
    const order = await this.orders.findById(orderId);
    if (!order) {
      return null;
    }
    // Reuse the order visibility rule: a foreign order reads as if it does not exist.
    if (!actorCanAccessOrder(toOrderActor(actor), order)) {
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
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toDecimalString(),
        subtotal: item.subtotal.toDecimalString(),
      })),
    };
  }
}
