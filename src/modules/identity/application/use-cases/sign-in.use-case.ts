import { User } from '@modules/identity/domain/entities/user.entity';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { UsersFetchError } from '../errors/users-fetch.error';
import { InvalidCredentialsError } from '../errors/invalid-credentials.error';
import {
  type PasswordHasher,
  PASSWORD_HASHER,
} from '@modules/identity/domain/ports/password-hasher.port';
import { type TokenSigner, TOKEN_SIGNER } from '@modules/identity/domain/ports/token-signer.port';
import {
  REFRESH_TOKEN_GENERATOR,
  type RefreshTokenGenerator,
} from '@modules/identity/domain/ports/refresh-token-generator.port';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRepository,
} from '@modules/identity/domain/repositories/refresh-token.repository';
import { RefreshToken } from '@modules/identity/domain/entities/refresh-token.entity';
import { REFRESH_TOKEN_TTL_MS } from '../config/refresh-token-ttl.token';
import {
  AUDIT_LOGGER,
  type AuditLogInput,
  type AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class SignInUseCase {
  private readonly logger = new Logger(SignInUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(TOKEN_SIGNER)
    private readonly tokenSigner: TokenSigner,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(REFRESH_TOKEN_GENERATOR)
    private readonly refreshTokenGenerator: RefreshTokenGenerator,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(REFRESH_TOKEN_TTL_MS)
    private readonly refreshTtlMs: number,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  async execute(username: string, plainPassword: string): Promise<AuthTokens> {
    let user: User | null;

    try {
      user = await this.users.findByUsername(username);
    } catch (err) {
      throw new UsersFetchError('Could not retrieve user.', { cause: err });
    }

    const isValid = await User.verifyPasswordOrDecoy(user, plainPassword, this.passwordHasher);

    // Reject bad credentials, unknown user, and inactive accounts with the SAME
    // error so an inactive account is indistinguishable from a wrong password
    // (no account-status leak). The password is still verified first to keep
    // timing constant against enumeration.
    if (!isValid || !user || !user.canLogIn()) {
      await this.tryAudit({
        userId: user?.id ?? null,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entity: 'User',
        entityId: user?.id ?? null,
        metadata: { username },
      });
      throw new InvalidCredentialsError();
    }

    await this.tryAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      entity: 'User',
      entityId: user.id,
      metadata: { username },
    });

    const payload = { sub: user.id, username: user.username, role: user.role };
    const accessToken = await this.tokenSigner.sign(payload);

    // Issue and persist a fresh refresh token. Only the hash is stored; the
    // opaque value is returned once, here, and never again.
    const generated = this.refreshTokenGenerator.generate();
    const refresh = RefreshToken.issue({
      userId: user.id,
      tokenHash: generated.tokenHash,
      ttlMs: this.refreshTtlMs,
    });
    await this.refreshTokens.save(refresh);

    return { access_token: accessToken, refresh_token: generated.token };
  }

  // Audit must never break the login outcome, so failures here are swallowed.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during sign-in; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
