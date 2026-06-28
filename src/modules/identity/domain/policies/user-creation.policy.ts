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
