import { UserRole } from '@modules/identity/domain/value-objects/user-role';

export const ORDER_FOR_AI = Symbol('OrderForAi');

/**
 * The principal an AI tool acts for. A local shape, not the ai context's
 * ActorContext: the orders context must not import another context's types, so the
 * caller adapts its actor into this at the boundary.
 */
export interface OrderAiActor {
  userId: string;
  role: UserRole;
  businessUnitIds: string[];
}

/** Read-only order projection the assistant may show. Money is a decimal string, never a number. */
export interface OrderForAiView {
  id: string;
  status: string;
  channel: string;
  businessUnitId: string;
  customerId: string | null;
  total: string;
  createdAt: string;
  items: {
    productId: string;
    /**
     * Name as of the order date. Present so the assistant can name what was bought
     * without a catalog call, which would return the product's CURRENT name and
     * reintroduce exactly the drift the snapshot exists to remove.
     */
    productName: string;
    quantity: number;
    unitPrice: string;
    subtotal: string;
  }[];
}

/**
 * Narrowing an AI tool may request on a listing. All optional, AND-combined.
 *
 * The channel and status stay plain strings rather than this context's VOs: the ai
 * context must not import the orders domain, and these values originate from a model
 * that is free to invent one. The service validates them and drops what it does not
 * recognise, so an unknown value narrows to nothing rather than reaching the query.
 */
export interface OrderListForAiFilters {
  /** Narrows within the actor's scope; one outside it yields no rows, never a widening. */
  businessUnitId?: string;
  orderChannel?: string;
  orderStatus?: string;
  createdAtFrom?: Date;
  createdAtTo?: Date;
}

/** A capped page. `hasMore` lets the assistant say the list was truncated. */
export interface OrderListForAiResult {
  orders: OrderForAiView[];
  hasMore: boolean;
}

/**
 * Capability the orders context publishes for the ai context. Visibility is scoped
 * to the actor exactly as the HTTP routes are, so a foreign order reads as absent.
 */
export interface OrderForAi {
  /** Returns null when the order is missing OR not visible to the actor. */
  findByIdForActor(orderId: string, actor: OrderAiActor): Promise<OrderForAiView | null>;
  /** A capped page of the orders visible to the actor, newest first. */
  listForActor(filters: OrderListForAiFilters, actor: OrderAiActor): Promise<OrderListForAiResult>;
}
