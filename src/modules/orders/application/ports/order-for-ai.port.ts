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
    quantity: number;
    unitPrice: string;
    subtotal: string;
  }[];
}

/**
 * Capability the orders context publishes for the ai context. Visibility is scoped
 * to the actor exactly as the HTTP routes are, so a foreign order reads as absent.
 */
export interface OrderForAi {
  /** Returns null when the order is missing OR not visible to the actor. */
  findByIdForActor(orderId: string, actor: OrderAiActor): Promise<OrderForAiView | null>;
}
