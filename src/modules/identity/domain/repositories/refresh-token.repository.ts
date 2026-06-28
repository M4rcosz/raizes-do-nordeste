import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { RefreshToken } from '../entities/refresh-token.entity';

export interface RefreshTokenRepository {
  /** Looks up a token by its stored hash. Returns null when nothing matches. */
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;

  /** Persists a newly issued token. `tx` lets it share a rotation's atomic unit. */
  save(token: RefreshToken, tx?: TransactionContext): Promise<void>;

  /**
   * Conditionally revokes one token and links it to its successor, but only while
   * it is still un-revoked (`revokedAt IS NULL`). `replacedById` is the id of the
   * token that replaced it (rotation), or null for a plain revoke. Returns the
   * number of rows changed: 0 means it was already revoked (lost a concurrent
   * rotation), which the caller treats as a failed rotation.
   */
  revoke(id: string, replacedById: string | null, tx?: TransactionContext): Promise<number>;

  /**
   * Revokes the rotation chain reachable from `tokenId` by walking replacedById
   * forward. Used on reuse detection and logout to kill the whole family.
   * Idempotent: already-revoked rows are left as-is.
   */
  revokeChainFrom(tokenId: string, tx?: TransactionContext): Promise<void>;

  /**
   * Revokes every still-active token of a user in one write (revokedAt IS NULL ->
   * now). Used after a password change to force re-authentication everywhere. `tx`
   * shares the password-change atomic unit. Returns the number of rows revoked.
   */
  revokeAllActiveForUser(userId: string, tx?: TransactionContext): Promise<number>;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol('RefreshTokenRepository');
