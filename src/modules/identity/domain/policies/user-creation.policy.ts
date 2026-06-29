import { UserRole } from '../value-objects/user-role';

// Pure authorization policy: decides whether an actor with `actorRole` may create,
// deactivate, or reactivate a user holding `targetRole`. No I/O, no framework.
// Use cases apply this and translate false into a FORBIDDEN error; @Roles on the
// controller is only the coarse filter (it cannot see the target role).
//
// Rules:
//   ADMIN    -> any role (including ADMIN)
//   MANAGER  -> only ATTENDANT and KITCHEN
//   everyone else -> nothing
export function canRoleCreate(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === UserRole.ADMIN) {
    return true;
  }

  if (actorRole === UserRole.MANAGER) {
    return targetRole === UserRole.ATTENDANT || targetRole === UserRole.KITCHEN;
  }

  return false;
}

/**
 * Unit-scope check for managing (deactivate/reactivate) an existing user.
 * ADMIN reaches everyone. MANAGER reaches a target only when their unit scopes
 * overlap (non-empty intersection). Everyone else: no reach. This complements
 * canRoleCreate (the role-target rule); both must hold to manage a user.
 */
export function canManageInUnits(
  actorRole: UserRole,
  actorUnitIds: string[],
  targetUnitIds: string[],
): boolean {
  if (actorRole === UserRole.ADMIN) {
    return true;
  }

  if (actorRole === UserRole.MANAGER) {
    return actorUnitIds.some((id) => targetUnitIds.includes(id));
  }

  return false;
}
