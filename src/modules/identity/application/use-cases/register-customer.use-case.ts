import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUDIT_LOGGER,
  type AuditLogInput,
  type AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { User } from '@modules/identity/domain/entities/user.entity';
import {
  type PasswordHasher,
  PASSWORD_HASHER,
} from '@modules/identity/domain/ports/password-hasher.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';

export interface RegisterCustomerCommand {
  name: string;
  username: string;
  password: string;
  email?: string | null;
  phone?: string | null;
}

@Injectable()
export class RegisterCustomerUseCase {
  private readonly logger = new Logger(RegisterCustomerUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  // Self-registration: the role is always CUSTOMER, never taken from the request.
  // Unicity conflicts surface from the repo as UserAlreadyExistsError (CONFLICT).
  async execute(command: RegisterCustomerCommand): Promise<User> {
    const passwordHash = await this.passwordHasher.hash(command.password);

    const user = User.register({
      name: command.name,
      username: command.username,
      passwordHash,
      role: UserRole.CUSTOMER,
      email: command.email ?? null,
      phone: command.phone ?? null,
      businessUnitIds: [],
    });

    const created = await this.users.create(user.toCreateInput());

    await this.tryAudit({
      userId: created.id,
      action: AUDIT_ACTIONS.CUSTOMER_REGISTERED,
      entity: 'User',
      entityId: created.id,
      metadata: { username: created.username },
    });

    return created;
  }

  // Audit must never break the registration outcome.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during customer registration; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
