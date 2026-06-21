import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUDIT_LOGGER,
  type AuditLogInput,
  type AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { User } from '@modules/identity/domain/entities/user.entity';
import { canRoleCreate } from '@modules/identity/domain/policies/user-creation.policy';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { UserCreationForbiddenError } from '../errors/user-creation-forbidden.error';
import { UserDeactivationConflictError } from '../errors/user-deactivation-conflict.error';
import { UserNotFoundError } from '../errors/user-not-found.error';

export interface DeactivateUserActor {
  id: string;
  role: UserRole;
}

@Injectable()
export class DeactivateUserUseCase {
  private readonly logger = new Logger(DeactivateUserUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  // Authorization is symmetric to creation (same policy): ADMIN may deactivate
  // anyone except themselves; MANAGER only ATTENDANT/KITCHEN. Not soft-delete:
  // it just flips is_active to false.
  async execute(actor: DeactivateUserActor, targetId: string): Promise<User> {
    // Block self-deactivation outright, even for ADMIN (locking yourself out).
    if (actor.id === targetId) {
      throw new UserCreationForbiddenError('You cannot deactivate your own account.');
    }

    const target = await this.users.findById(targetId);
    if (!target) {
      throw new UserNotFoundError(`User ${targetId} not found.`);
    }

    if (!canRoleCreate(actor.role, target.role)) {
      throw new UserCreationForbiddenError(
        `Role ${actor.role} is not allowed to deactivate a ${target.role} user.`,
      );
    }

    // Condition the write on the role we just authorized against. If the role
    // changed (or the user was already inactive) between read and write, no row
    // matches and we get null: the authorization decision is stale, so reject.
    const updated = await this.users.deactivateIfRole(targetId, target.role, actor.id);
    if (!updated) {
      throw new UserDeactivationConflictError(
        `User ${targetId} changed during deactivation; please retry.`,
      );
    }

    await this.tryAudit({
      userId: actor.id,
      action: AUDIT_ACTIONS.USER_DEACTIVATED,
      entity: 'User',
      entityId: updated.id,
      metadata: { username: updated.username, role: updated.role },
    });

    return updated;
  }

  // Audit must never break the deactivation outcome.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during user deactivation; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
