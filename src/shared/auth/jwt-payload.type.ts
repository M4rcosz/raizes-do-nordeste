import { UserRole } from '@modules/identity/domain/value-objects/user-role';

// businessUnitIds scopes a staff member to the units they are bound to (N:N). An
// empty array means no unit binding: ADMIN/CUSTOMER ignore it (gated by role),
// other staff with [] are blocked at unit-scoped endpoints.
export type JwtPayloadSign = {
  sub: string;
  username: string;
  role: UserRole;
  businessUnitIds: string[];
};

export interface JwtPayload extends JwtPayloadSign {
  iat: number; // issued at (UNIX seconds)
  exp: number; // expiration (UNIX seconds)
}
