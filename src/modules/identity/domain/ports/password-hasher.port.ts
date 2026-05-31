/** Hashes and verifies passwords; the application depends on this seam, not on argon2. */
export interface PasswordHasher {
  hash(plainPassword: string): Promise<string>;
  /**
   * Checks `plainPassword` against `passwordHash`. A `null` hash is the decoy case
   * (no such user): it still performs a comparison so timing stays constant, and
   * always resolves `false`. See {@link User.verifyPasswordOrDecoy}.
   */
  verify(passwordHash: string | null, plainPassword: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol('PasswordHasher');
