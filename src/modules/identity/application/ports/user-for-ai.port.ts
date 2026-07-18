import { UserRole } from '@modules/identity/domain/value-objects/user-role';

export const USER_FOR_AI = Symbol('UserForAi');

/**
 * The principal an AI tool acts for. A local shape, not the ai context's
 * ActorContext: the identity context must not import another context's types, so the
 * caller adapts its actor into this at the boundary.
 */
export interface UserAiActor {
  userId: string;
  role: UserRole;
  businessUnitIds: string[];
}

/**
 * Read-only user projection the assistant may show. Minimised, NOT free of personal
 * data: `name` is still personal data under LGPD, and it crosses into a third-party
 * model and comes back rendered as chat text the client stores. What is deliberately
 * excluded is contact and credential data - email, phone, password hash - matching
 * the audit context's redaction of password/token/CPF.
 *
 * If the operational need is ever satisfied by `username` + `role` alone, drop `name`:
 * it is here because staff identify each other by it, not because it is required.
 */
export interface UserForAiView {
  id: string;
  username: string;
  name: string;
  role: string;
  isActive: boolean;
  businessUnitIds: string[];
}

/** Narrowing an AI tool may request. All optional, AND-combined. */
export interface UserListForAiFilters {
  /** Case-insensitive substring match on username. */
  username?: string;
  businessUnitId?: string;
}

/** A capped page. `hasMore` lets the assistant say the list was truncated. */
export interface UserListForAiResult {
  users: UserForAiView[];
  hasMore: boolean;
}

/**
 * Capability the identity context publishes for the ai context. ADMIN-only at the
 * tool layer; this port still refuses a non-ADMIN actor itself rather than trusting
 * the caller to have gated it.
 */
export interface UserForAi {
  /** A capped page of users. Empty for any actor that is not ADMIN. */
  listForActor(filters: UserListForAiFilters, actor: UserAiActor): Promise<UserListForAiResult>;
}
