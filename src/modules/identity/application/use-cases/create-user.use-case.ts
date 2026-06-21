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
import { canRoleCreate } from '@modules/identity/domain/policies/user-creation.policy';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { UserCreationForbiddenError } from '../errors/user-creation-forbidden.error';

export interface CreateUserCommand {
  name: string;
  username: string;
  password: string;
  role: UserRole;
  email?: string | null;
  phone?: string | null;
  businessUnitId?: string | null;
}

export interface CreateUserActor {
  id: string;
  role: UserRole;
}

@Injectable()
export class CreateUserUseCase {
  private readonly logger = new Logger(CreateUserUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  // @Roles gates ADMIN/MANAGER at the controller. The fine rule (who may create
  // which role) lives in the domain policy and is enforced here.
  async execute(actor: CreateUserActor, command: CreateUserCommand): Promise<User> {
    if (!canRoleCreate(actor.role, command.role)) {
      throw new UserCreationForbiddenError(
        `Role ${actor.role} is not allowed to create a ${command.role} user.`,
      );
    }

    const passwordHash = await this.passwordHasher.hash(command.password);

    const user = User.register({
      name: command.name,
      username: command.username,
      passwordHash,
      role: command.role,
      email: command.email ?? null,
      phone: command.phone ?? null,
      businessUnitId: command.businessUnitId ?? null,
    });

    const created = await this.users.create(user.toCreateInput());

    await this.tryAudit({
      userId: actor.id,
      action: AUDIT_ACTIONS.USER_CREATED,
      entity: 'User',
      entityId: created.id,
      metadata: { username: created.username, role: created.role },
    });

    return created;
  }

  // Audit must never break the creation outcome.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during user creation; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
