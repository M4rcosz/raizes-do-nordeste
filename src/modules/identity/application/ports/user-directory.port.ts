export const USER_DIRECTORY = Symbol('UserDirectory');

/**
 * Enough to label a user id in an internal report. Separate from UserForAiView on
 * purpose: that projection deliberately excludes email (it crosses into a
 * third-party model and comes back as chat text). This one carries email because
 * an admin reading a billing-style report needs to reach the person - it must
 * never be wired into an AI tool.
 */
export interface UserDirectoryEntry {
  id: string;
  name: string;
  /** Null for accounts created without one (email is optional in the schema). */
  email: string | null;
}

/**
 * Capability the identity context publishes so other contexts can put a name on a
 * user id they already hold. Batched by design: a per-id lookup inside a loop is
 * the N+1 this port exists to prevent.
 */
export interface UserDirectory {
  /** Resolves the given ids in one shot. Unknown ids are simply absent. */
  findByIds(ids: string[]): Promise<UserDirectoryEntry[]>;
}
