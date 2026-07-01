import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import type { Order } from '@modules/orders/domain/entities/order.entity';

/**
 * The authenticated principal acting on orders, resolved by the HTTP layer from
 * the JWT. businessUnitIds is the set of units a staff member is bound to (N:N).
 * ADMIN ignores it (brand-wide); CUSTOMER is bound to their own orders, not to a
 * unit.
 */
export interface OrderActor {
  id: string;
  role: UserRole;
  businessUnitIds: string[];
}

/**
 * Whether the actor may see/act on a specific order.
 * ADMIN reaches every order; CUSTOMER only their own; any other staff only orders
 * of a unit in their claim. A foreign order must read as if it does not exist, so
 * callers turn `false` into the same not-found the missing-row path returns.
 */
export function actorCanAccessOrder(actor: OrderActor, order: Order): boolean {
  if (actor.role === UserRole.ADMIN) {
    return true;
  }
  if (actor.role === UserRole.CUSTOMER) {
    return order.customerId === actor.id;
  }
  return actor.businessUnitIds.includes(order.businessUnitId);
}

/**
 * The unit IN-scope for an order listing. `undefined` means unrestricted (ADMIN
 * brand-wide). For staff the claim is the ceiling; an explicit businessUnitId
 * filter narrows within it, and one outside the claim yields `[]` (no rows) rather
 * than leaking other units.
 */
export function resolveOrderUnitScope(
  actor: OrderActor,
  requestedBusinessUnitId?: string,
): string[] | undefined {
  if (actor.role === UserRole.ADMIN) {
    return requestedBusinessUnitId ? [requestedBusinessUnitId] : undefined;
  }
  if (requestedBusinessUnitId) {
    return actor.businessUnitIds.includes(requestedBusinessUnitId) ? [requestedBusinessUnitId] : [];
  }
  return actor.businessUnitIds;
}
