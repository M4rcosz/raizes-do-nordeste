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
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '@modules/identity/domain/repositories/refresh-token.repository';
import {
  REFRESH_TOKEN_GENERATOR,
  type RefreshTokenGenerator,
} from '@modules/identity/domain/ports/refresh-token-generator.port';
import { RefreshToken } from '@modules/identity/domain/entities/refresh-token.entity';
import { RefreshTokenFetchError } from '../errors/refresh-token-fetch.error';

@Injectable()
export class LogoutUseCase {
  private readonly logger = new Logger(LogoutUseCase.name);

  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(REFRESH_TOKEN_GENERATOR)
    private readonly generator: RefreshTokenGenerator,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  /**
   * Revokes the presented refresh token and its rotation family. Idempotent: an
   * unknown token is a no-op (no error), so logout never leaks whether a token
   * was valid. The access token stays valid until its short TTL expires.
   */
  async execute(plainRefreshToken: string): Promise<void> {
    const tokenHash = this.generator.hash(plainRefreshToken);

    let existing: RefreshToken | null;
    try {
      existing = await this.refreshTokens.findByTokenHash(tokenHash);
    } catch (err) {
      throw new RefreshTokenFetchError('Could not retrieve refresh token.', { cause: err });
    }

    if (existing === null) {
      return;
    }

    await this.transactions.run((tx) => this.refreshTokens.revokeChainFrom(existing.id, tx));

    await this.tryAudit({
      userId: existing.userId,
      action: AUDIT_ACTIONS.LOGOUT,
      entity: 'RefreshToken',
      entityId: existing.id,
    });
  }

  // Audit must never break logout, so failures here are swallowed.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during logout; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
