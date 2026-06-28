import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUDIT_LOGGER,
  type AuditLogInput,
  type AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { User } from '@modules/identity/domain/entities/user.entity';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '@modules/identity/domain/ports/password-hasher.port';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '@modules/identity/domain/repositories/refresh-token.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@shared/transaction/transaction-runner.port';
import { InvalidCredentialsError } from '../errors/invalid-credentials.error';
import { SamePasswordError } from '../errors/same-password.error';
import { UserNotFoundError } from '../errors/user-not-found.error';

export interface ChangePasswordCommand {
  currentPassword: string;
  newPassword: string;
}

@Injectable()
export class ChangePasswordUseCase {
  private readonly logger = new Logger(ChangePasswordUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  // actorId is always the authenticated user: self-service password change only.
  async execute(actorId: string, command: ChangePasswordCommand): Promise<void> {
    const user = await this.users.findById(actorId);
    if (!user) {
      throw new UserNotFoundError(`User ${actorId} not found.`);
    }

    // Inactive accounts are rejected with the same error as wrong credentials
    // (consistent with sign-in) so the deactivation state is not disclosed
    // through a different status code to a caller with a stale token.
    if (!user.canLogIn()) {
      throw new InvalidCredentialsError();
    }

    // Verify the current password FIRST, before any reuse check, so a caller
    // cannot probe password rules without proving they own the account. Reuse the
    // same verification path as sign-in (same error on mismatch).
    const isCurrentValid = await User.verifyPasswordOrDecoy(
      user,
      command.currentPassword,
      this.passwordHasher,
    );
    if (!isCurrentValid) {
      throw new InvalidCredentialsError();
    }

    // currentPassword is now proven to be the real secret, so an equal newPassword
    // is a no-op. A plain-string compare is the robust choice here precisely
    // because hashing is salted (non-deterministic): re-hashing newPassword and
    // comparing digests would never match even for an identical password.
    if (command.newPassword === command.currentPassword) {
      throw new SamePasswordError();
    }

    const newHash = await this.passwordHasher.hash(command.newPassword);
    // Domain owns the projection; the repo persists the hash it produced.
    const projected = user.withPasswordHash(newHash);

    // Atomic: rotate the hash and kill every active refresh token together, so a
    // crash can never leave old sessions alive against the new password.
    let revokedCount = 0;
    await this.transactions.run(async (tx) => {
      const updated = await this.users.updatePasswordHash(
        actorId,
        projected.toCreateInput().passwordHash,
        actorId,
        tx,
      );
      if (!updated) {
        throw new UserNotFoundError(`User ${actorId} not found.`);
      }
      revokedCount = await this.refreshTokens.revokeAllActiveForUser(actorId, tx);
    });

    // Audited after the tx commits and best-effort: a failed audit write must not
    // roll back a committed password change. Metadata carries no secret.
    await this.tryAudit({
      userId: actorId,
      action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
      entity: 'User',
      entityId: actorId,
      metadata: { revokedSessions: revokedCount },
    });
  }

  // Audit must never break the password change, so failures here are swallowed.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during password change; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
