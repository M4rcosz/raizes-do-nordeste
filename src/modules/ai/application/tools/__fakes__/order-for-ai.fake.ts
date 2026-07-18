import type {
  OrderAiActor,
  OrderForAi,
  OrderForAiView,
  OrderListForAiFilters,
  OrderListForAiResult,
} from '@modules/orders/application/ports/order-for-ai.port';

/**
 * In-memory OrderForAi fake. Seed views keyed by orderId and, optionally, the set of
 * user ids allowed to see each one so tests can exercise actor scoping (a not-visible
 * order reads as null, exactly like the real service).
 */
export class FakeOrderForAi implements OrderForAi {
  private readonly orders = new Map<string, OrderForAiView>();
  private readonly visibleTo = new Map<string, Set<string>>();
  readonly calls: { orderId: string; actor: OrderAiActor }[] = [];
  readonly listCalls: { filters: OrderListForAiFilters; actor: OrderAiActor }[] = [];
  listHasMore = false;

  seed(view: OrderForAiView, visibleToUserIds?: string[]): this {
    this.orders.set(view.id, view);
    if (visibleToUserIds) {
      this.visibleTo.set(view.id, new Set(visibleToUserIds));
    }
    return this;
  }

  findByIdForActor(orderId: string, actor: OrderAiActor): Promise<OrderForAiView | null> {
    this.calls.push({ orderId, actor });
    const view = this.orders.get(orderId);
    if (!view) {
      return Promise.resolve(null);
    }
    const allowed = this.visibleTo.get(orderId);
    if (allowed && !allowed.has(actor.userId)) {
      return Promise.resolve(null);
    }
    return Promise.resolve(view);
  }

  /**
   * Returns every seeded order the actor may see, applying the same visibility map
   * findByIdForActor uses. Filters are recorded, not applied: the registry's job is
   * to forward them, and asserting on what arrived is the point.
   */
  listForActor(filters: OrderListForAiFilters, actor: OrderAiActor): Promise<OrderListForAiResult> {
    this.listCalls.push({ filters, actor });
    const visible = [...this.orders.values()].filter((view) => {
      const allowed = this.visibleTo.get(view.id);
      return !allowed || allowed.has(actor.userId);
    });
    return Promise.resolve({ orders: visible, hasMore: this.listHasMore });
  }
}
