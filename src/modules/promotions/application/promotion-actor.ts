import { UserRole } from '@modules/identity/domain/value-objects/user-role';

/**
 * The authenticated principal acting on promotions, resolved by the HTTP layer
 * from the JWT claim. businessUnitIds is the set of units the actor is bound to;
 * an empty set on a non-admin never reaches a management use case (the guard
 * stops it first). ADMIN ignores the set (reaches every unit).
 */
export interface PromotionActor {
  role: UserRole;
  businessUnitIds: string[];
}

/**
 * Ownership predicate. ADMIN reaches every unit; anyone else is bound to their
 * own units, so a promotion of a unit outside the claim must read as if it does
 * not exist.
 */
export function actorOwnsUnit(actor: PromotionActor, businessUnitId: string): boolean {
  return actor.role === UserRole.ADMIN || actor.businessUnitIds.includes(businessUnitId);
}
