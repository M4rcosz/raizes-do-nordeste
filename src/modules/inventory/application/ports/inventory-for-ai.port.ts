import { UserRole } from '@modules/identity/domain/value-objects/user-role';

export const INVENTORY_FOR_AI = Symbol('InventoryForAi');

/**
 * The principal an AI tool acts for. A local shape, not the ai context's
 * ActorContext: the inventory context must not import another context's types, so
 * the caller adapts its actor into this at the boundary.
 */
export interface InventoryAiActor {
  userId: string;
  role: UserRole;
  businessUnitIds: string[];
}

/** Read-only stock projection the assistant may show staff. */
export interface InventoryForAiView {
  productId: string;
  quantity: number;
  minQuantity: number;
  /**
   * Straight from Inventory.isLowStock() (at or below the threshold), not recomputed
   * here: the assistant must call stock "low" on the same rule that raises a
   * STOCK_ALERT, or it would tell staff a product is fine while the system alerts on it.
   */
  isLowStock: boolean;
}

/** A capped page. `hasMore` lets the assistant say the list was truncated. */
export interface InventoryListForAiResult {
  inventory: InventoryForAiView[];
  hasMore: boolean;
}

/**
 * Capability the inventory context publishes for the ai context. Unit visibility
 * follows the same rule the HTTP routes enforce via UnitScopeGuard: ADMIN reaches
 * any unit, staff only units in their claim.
 */
export interface InventoryForAi {
  /** A capped page of stock at one unit. Empty when the actor cannot see that unit. */
  listForActor(businessUnitId: string, actor: InventoryAiActor): Promise<InventoryListForAiResult>;
}
