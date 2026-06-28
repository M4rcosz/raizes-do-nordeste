import { UserRole } from '@modules/identity/domain/value-objects/user-role';

/**
 * The authenticated principal acting on promotions, resolved by the HTTP layer
 * from the JWT claim. businessUnitId null is a global ADMIN; a non-admin never
 * reaches a management use case with a null scope (the guard stops it first).
 */
export interface PromotionActor {
  role: UserRole;
  businessUnitId: string | null;
}

/**
 * Ownership predicate. ADMIN reaches every unit (including the global/null
 * scope); anyone else is bound to their own unit, so a promotion of another unit
 * must read as if it does not exist.
 */
export function actorOwnsUnit(actor: PromotionActor, businessUnitId: string): boolean {
  return actor.role === UserRole.ADMIN || actor.businessUnitId === businessUnitId;
}
