/**
 * Password length and strength rules for the write paths. Shared by every write
 * path (the register/admin-create DTOs and the non-HTTP bootstrap-admin script) so
 * they cannot drift apart. Mirrors the shape of username.ts.
 */

export const PASSWORD_MIN_LENGTH = 10;

/**
 * Upper bound on a password reaching the argon2 hasher. Without it a caller can POST
 * a multi-megabyte string and make the hasher burn CPU/memory on every request. The
 * LOGIN border applies only this cap, never the strength/min-length rule: an account
 * created under an older policy must still authenticate.
 */
export const PASSWORD_MAX_LENGTH = 128;

// A strong password must mix at least this many of the four character classes.
export const PASSWORD_MIN_CHARACTER_CLASSES = 3;

const CHARACTER_CLASSES = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/];

export const PASSWORD_STRENGTH_MESSAGE = `Password must combine at least ${PASSWORD_MIN_CHARACTER_CLASSES} of: lowercase, uppercase, digit, symbol.`;

// Counts how many of (lowercase, uppercase, digit, symbol) the value uses and
// requires at least PASSWORD_MIN_CHARACTER_CLASSES of them.
export function hasEnoughCharacterClasses(value: string): boolean {
  const matched = CHARACTER_CLASSES.filter((re) => re.test(value)).length;
  return matched >= PASSWORD_MIN_CHARACTER_CLASSES;
}

/**
 * The same rules the create/register DTOs apply, in a form a non-HTTP write path can
 * call (the bootstrap-admin script). Returns the reason it was rejected, or null when
 * the password is acceptable. Keep this in step with the decorators on
 * CreateUserDto/RegisterCustomerDto.
 */
export function passwordRejectionReason(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  if (!hasEnoughCharacterClasses(password)) {
    return PASSWORD_STRENGTH_MESSAGE;
  }
  return null;
}
