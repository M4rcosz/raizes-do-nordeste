/**
 * Format and reservation rules for the login key. Shared by every write path so
 * the admin-create and the public self-register DTOs cannot drift apart.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 50;

/**
 * Upper bound for a username arriving at the LOGIN border. Deliberately far above
 * USERNAME_MAX_LENGTH: login must not enforce the registration format rules, or an
 * account created before those rules existed (or through the bootstrap script, or a
 * raw insert) could never authenticate again - and there is no rename endpoint to
 * recover with. This bound exists only to stop an unbounded string reaching the
 * failed-login audit metadata, not to police identity.
 */
export const USERNAME_LOGIN_MAX_LENGTH = 256;

/**
 * Lowercase alphanumeric with . _ - as inner separators. First and last chars
 * must be alphanumeric, so "..", "-joao" and "joao." are rejected. Case is
 * rejected rather than folded: the DB column is citext, so "Joao" would collide
 * with "joao" on insert anyway - a 400 explains that better than a 409.
 */
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

export const USERNAME_PATTERN_MESSAGE =
  'username must be lowercase alphanumeric, may contain . _ or - between characters, and must start and end with a letter or digit';

/**
 * Names nobody may register. Two reasons they are here:
 * route collisions (GET /users/me resolves to a fixed route, so a user named
 * "me" is unreachable) and impersonation (a customer named "support" or
 * "security" can phish other customers).
 *
 * Lowercase only - USERNAME_PATTERN already rejects any uppercase input, so a
 * case-insensitive comparison would be dead code.
 */
export const RESERVED_USERNAMES: readonly string[] = [
  'admin',
  'administrator',
  'anonymous',
  'api',
  'auth',
  'login',
  'logout',
  'manager',
  'me',
  'moderator',
  'null',
  'register',
  'root',
  'security',
  'staff',
  'support',
  'system',
  'undefined',
  'user',
  'users',
];

export const RESERVED_USERNAME_MESSAGE = 'username is reserved';

/**
 * The same rules the create/register DTOs apply, in a form a non-HTTP write path
 * can call (the bootstrap-admin script). Returns the reason it was rejected, or
 * null when the username is acceptable. Keep this in step with the decorators on
 * CreateUserDto/RegisterCustomerDto - they are the same three rules.
 */
export function usernameRejectionReason(username: string): string | null {
  if (username.length < USERNAME_MIN_LENGTH) {
    return `username must be at least ${USERNAME_MIN_LENGTH} characters`;
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return `username must be at most ${USERNAME_MAX_LENGTH} characters`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return USERNAME_PATTERN_MESSAGE;
  }
  if (RESERVED_USERNAMES.includes(username)) {
    return RESERVED_USERNAME_MESSAGE;
  }
  return null;
}
