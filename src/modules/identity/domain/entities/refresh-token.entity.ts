import { randomUUID } from 'node:crypto';

export interface IssueRefreshTokenProps {
  userId: string;
  // SHA-256 hash of the opaque value. The plaintext never reaches the domain.
  tokenHash: string;
  // Time-to-live in milliseconds, used to derive expiresAt from now.
  ttlMs: number;
}

export interface RefreshTokenProps {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  createdAt: Date;
}

/**
 * A single-use refresh token. Expiry is checked here (not just trusted to the
 * DB) so the rule lives with the data. Revocation and rotation linkage are
 * persisted fields the repository writes; the entity only exposes the
 * invariants the use cases reason about.
 */
export class RefreshToken {
  private constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly tokenHash: string,
    public readonly expiresAt: Date,
    public readonly revokedAt: Date | null,
    public readonly replacedById: string | null,
    public readonly createdAt: Date,
  ) {}

  /** Mints a fresh token row. The caller owns entropy/hashing; we own id, timestamps, expiry. */
  static issue(props: IssueRefreshTokenProps): RefreshToken {
    const now = new Date();
    return new RefreshToken(
      randomUUID(),
      props.userId,
      props.tokenHash,
      new Date(now.getTime() + props.ttlMs),
      null,
      null,
      now,
    );
  }

  /** Rebuilds an entity from a persisted row. */
  static fromPersistence(props: RefreshTokenProps): RefreshToken {
    return new RefreshToken(
      props.id,
      props.userId,
      props.tokenHash,
      props.expiresAt,
      props.revokedAt,
      props.replacedById,
      props.createdAt,
    );
  }

  isRevoked(): boolean {
    return this.revokedAt !== null;
  }

  isExpired(now: Date = new Date()): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }

  /** A token may be rotated only while it is neither revoked nor expired. */
  canRotate(now: Date = new Date()): boolean {
    return !this.isRevoked() && !this.isExpired(now);
  }
}
