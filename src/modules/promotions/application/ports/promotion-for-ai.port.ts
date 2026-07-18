import { UserRole } from '@modules/identity/domain/value-objects/user-role';

export const PROMOTION_FOR_AI = Symbol('PromotionForAi');

/**
 * The principal an AI tool acts for. A local shape, not the ai context's
 * ActorContext: the promotions context must not import another context's types, so
 * the caller adapts its actor into this at the boundary.
 */
export interface PromotionAiActor {
  userId: string;
  role: UserRole;
  businessUnitIds: string[];
}

/** Read-only promotion projection. Money fields are decimal strings, never numbers. */
export interface PromotionForAiView {
  id: string;
  name: string;
  discountType: string;
  discountValue: string;
  minOrderValue: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

/** A capped page. `hasMore` lets the assistant say the list was truncated. */
export interface PromotionListForAiResult {
  promotions: PromotionForAiView[];
  hasMore: boolean;
}

/**
 * Capability the promotions context publishes for the ai context. Unit visibility
 * follows the same rule the HTTP routes enforce via UnitScopeGuard: ADMIN reaches
 * any unit, staff only units in their claim.
 */
export interface PromotionForAi {
  /** A capped page of a unit's promotions. Empty when the actor cannot see that unit. */
  listForActor(businessUnitId: string, actor: PromotionAiActor): Promise<PromotionListForAiResult>;
}
