/** A freshly minted refresh token: the opaque plaintext for the client, and the hash we store. */
export interface GeneratedRefreshToken {
  // High-entropy opaque value handed to the client. NEVER persisted.
  token: string;
  // SHA-256 of `token`. The only thing that reaches the database.
  tokenHash: string;
}

/**
 * Mints opaque high-entropy refresh tokens and hashes them. Kept separate from
 * TokenSigner: refresh tokens are random secrets we store as a hash, not signed
 * JWTs, so overloading the JWT signer would conflate two different mechanisms.
 */
export interface RefreshTokenGenerator {
  /** Produces a new random value plus its hash. */
  generate(): GeneratedRefreshToken;
  /** Hashes a client-presented plaintext so it can be looked up against the stored hash. */
  hash(token: string): string;
}

export const REFRESH_TOKEN_GENERATOR = Symbol('RefreshTokenGenerator');
