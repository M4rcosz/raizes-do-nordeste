import { UserRole } from '@modules/identity/domain/value-objects/user-role';

// businessUnitId scopes a staff member to one unit. null means global reach:
// ADMINs ride global, non-admins with null are blocked at unit-scoped endpoints.
export type JwtPayloadSign = {
  sub: string;
  username: string;
  role: UserRole;
  businessUnitId: string | null;
};

export interface JwtPayload extends JwtPayloadSign {
  iat: number; // issued at (UNIX seconds)
  exp: number; // expiration (UNIX seconds)
}
