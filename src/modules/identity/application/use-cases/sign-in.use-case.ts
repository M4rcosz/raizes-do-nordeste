import { User } from '@modules/identity/domain/entities/user.entity';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { UsersFetchError } from '../errors/users-fetch.error';
import {
  type IPasswordHasher,
  PASSWORD_HASHER,
} from '@modules/identity/domain/ports/password-hasher.port';
import { type ITokenSigner, TOKEN_SIGNER } from '@modules/identity/domain/ports/token-signer.port';
import {
  AUDIT_LOGGER,
  type AuditLogInput,
  type IAuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';

@Injectable()
export class SignInUseCase {
  private readonly logger = new Logger(SignInUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: IUserRepository,
    @Inject(TOKEN_SIGNER)
    private readonly tokenSigner: ITokenSigner,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(username: string, plainPassword: string): Promise<{ access_token: string }> {
    let user: User | null;

    try {
      user = await this.users.findByUsername(username);
    } catch (err) {
      throw new UsersFetchError('Could not retrieve user.', { cause: err });
    }

    const isValid = await User.verifyPasswordOrDecoy(user, plainPassword, this.passwordHasher);

    if (!isValid || !user) {
      await this.tryAudit({
        userId: user?.id ?? null,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entity: 'User',
        entityId: user?.id ?? null,
        metadata: { username },
      });
      throw new UnauthorizedException();
    }

    await this.tryAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      entity: 'User',
      entityId: user.id,
      metadata: { username },
    });

    const payload = { sub: user.id, username: user.username, role: user.role };
    const token = await this.tokenSigner.sign(payload);

    return { access_token: token };
  }

  // Defense-in-depth: audit must never break the login outcome, regardless of impl.
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
