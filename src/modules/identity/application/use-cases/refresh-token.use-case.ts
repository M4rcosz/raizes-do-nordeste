import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@shared/transaction/transaction-runner.port';
import {
  AUDIT_LOGGER,
  type AuditLogInput,
  type AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '@modules/identity/domain/repositories/refresh-token.repository';
import {
  REFRESH_TOKEN_GENERATOR,
  type RefreshTokenGenerator,
} from '@modules/identity/domain/ports/refresh-token-generator.port';
import { type TokenSigner, TOKEN_SIGNER } from '@modules/identity/domain/ports/token-signer.port';
import { RefreshToken } from '@modules/identity/domain/entities/refresh-token.entity';
import { User } from '@modules/identity/domain/entities/user.entity';
import { REFRESH_TOKEN_TTL_MS } from '../config/refresh-token-ttl.token';
import { InvalidRefreshTokenError } from '../errors/invalid-refresh-token.error';
import { RefreshTokenFetchError } from '../errors/refresh-token-fetch.error';
import { UsersFetchError } from '../errors/users-fetch.error';
import type { AuthTokens } from './sign-in.use-case';

@Injectable()
export class RefreshTokenUseCase {
  private readonly logger = new Logger(RefreshTokenUseCase.name);

  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(REFRESH_TOKEN_GENERATOR)
    private readonly generator: RefreshTokenGenerator,
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(TOKEN_SIGNER)
    private readonly tokenSigner: TokenSigner,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(REFRESH_TOKEN_TTL_MS)
    private readonly refreshTtlMs: number,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  /**
   * Rotates a refresh token: validates it, revokes it, and issues a new pair in
   * one atomic step. Every failing condition maps to the same
   * InvalidRefreshTokenError so callers cannot tell which check tripped.
   */
  async execute(plainRefreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.generator.hash(plainRefreshToken);

    let existing: RefreshToken | null;
    try {
      existing = await this.refreshTokens.findByTokenHash(tokenHash);
    } catch (err) {
      throw new RefreshTokenFetchError('Could not retrieve refresh token.', { cause: err });
    }

    if (existing === null) {
      throw new InvalidRefreshTokenError();
    }

    // Reuse detection: a revoked token re-presented means the chain may be
    // compromised. Kill the whole family (commit it), audit, then reject.
    if (existing.isRevoked()) {
      await this.transactions.run((tx) => this.refreshTokens.revokeChainFrom(existing.id, tx));
      await this.tryAudit({
        userId: existing.userId,
        action: AUDIT_ACTIONS.TOKEN_REUSE_DETECTED,
        entity: 'RefreshToken',
        entityId: existing.id,
      });
      throw new InvalidRefreshTokenError();
    }

    if (existing.isExpired()) {
      throw new InvalidRefreshTokenError();
    }

    // Binding: the user must still exist and be allowed to log in.
    const user = await this.loadActiveUser(existing.userId);
    if (user === null) {
      throw new InvalidRefreshTokenError();
    }

    const generated = this.generator.generate();
    const rotated = RefreshToken.issue({
      userId: user.id,
      tokenHash: generated.tokenHash,
      ttlMs: this.refreshTtlMs,
    });

    // Sign before the tx: if signing fails the tx never opens; if the tx fails
    // the signed access token is simply discarded with no side effect.
    const accessToken = await this.tokenSigner.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
      businessUnitId: user.businessUnitId,
    });

    // Atomic rotation: the new row lands and the old one is revoked + linked in
    // the same transaction. The revoke is guarded on revokedAt IS NULL, so a
    // concurrent rotation of the same token reports count 0 here; throwing inside
    // the tx rolls back the new token and only the first request wins.
    await this.transactions.run(async (tx) => {
      await this.refreshTokens.save(rotated, tx);
      const revoked = await this.refreshTokens.revoke(existing.id, rotated.id, tx);
      if (revoked === 0) {
        throw new InvalidRefreshTokenError();
      }
    });

    await this.tryAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.TOKEN_REFRESHED,
      entity: 'RefreshToken',
      entityId: rotated.id,
    });

    return { access_token: accessToken, refresh_token: generated.token };
  }

  // Returns the user only when present and still able to log in; null otherwise.
  // A DB failure is unavailable (not unauthorized), matching sign-in.
  private async loadActiveUser(userId: string): Promise<User | null> {
    try {
      const user = await this.users.findById(userId);
      return user && user.canLogIn() ? user : null;
    } catch (err) {
      throw new UsersFetchError('Could not retrieve user.', { cause: err });
    }
  }

  // Audit must never break the refresh outcome, so failures here are swallowed.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during refresh; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
