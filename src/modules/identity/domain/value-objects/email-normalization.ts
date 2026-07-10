/**
 * Email canonicalization shared by the identity write paths (the DTO decorator and
 * the bootstrap-admin script). This is NOT the full Email value object on the
 * roadmap: it only trims/lowercases and bounds length. Format validation stays with
 * the caller (class-validator @IsEmail / isEmail), not here.
 */

// RFC 5321 caps a full email address at 254 chars. Also keeps an unbounded value out
// of the DB and the audit log.
export const EMAIL_MAX_LENGTH = 254;

/**
 * Trim, then lowercase. The email column is a plain @unique (not citext like
 * username), so canonicalizing on the way in is what stops "Maria@X.com" and
 * "maria@x.com " becoming two accounts. The domain part is case-insensitive by spec;
 * the local part is case-sensitive in theory but treated case-insensitively by every
 * real provider, so folding it is the pragmatic choice.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
