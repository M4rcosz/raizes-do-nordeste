import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUDIT_LOGGER,
  type AuditLogInput,
  type AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { BusinessUnitScopeError } from '@shared/errors/application/business-unit-scope.error';
import { User } from '@modules/identity/domain/entities/user.entity';
import {
  canManageInUnits,
  canRoleCreate,
} from '@modules/identity/domain/policies/user-creation.policy';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { UserCreationForbiddenError } from '../errors/user-creation-forbidden.error';
import { UserReactivationConflictError } from '../errors/user-reactivation-conflict.error';
import { UserNotFoundError } from '../errors/user-not-found.error';

export interface ReactivateUserActor {
  id: string;
  role: UserRole;
  businessUnitIds: string[];
}

@Injectable()
export class ReactivateUserUseCase {
  private readonly logger = new Logger(ReactivateUserUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  // Authorization is symmetric to creation (same policy): ADMIN may reactivate
  // anyone; MANAGER only ATTENDANT/KITCHEN. The conditional write guards against
  // a role change between read and write without a self-guard (you cannot become
  // inactive yourself under normal flows).
  async execute(actor: ReactivateUserActor, targetId: string): Promise<User> {
    const target = await this.users.findById(targetId);
    if (!target) {
      throw new UserNotFoundError(`User ${targetId} not found.`);
    }

    if (!canRoleCreate(actor.role, target.role)) {
      throw new UserCreationForbiddenError(
        `Role ${actor.role} is not allowed to reactivate a ${target.role} user.`,
      );
    }

    // Unit scope: a MANAGER may only act on a target whose units overlap their
    // own. A disjoint scope reads as not-found so a foreign unit's staff stays
    // hidden. ADMIN bypasses (canManageInUnits returns true).
    if (!canManageInUnits(actor.role, actor.businessUnitIds, target.businessUnitIds)) {
      throw new BusinessUnitScopeError();
    }

    // Guard the write on the role authorized above. If role changed or user is
    // already active between read and write, count=0 and we reject.
    const updated = await this.users.reactivateIfRole(targetId, target.role, actor.id);
    if (!updated) {
      throw new UserReactivationConflictError(
        `User ${targetId} changed during reactivation; please retry.`,
      );
    }

    await this.tryAudit({
      userId: actor.id,
      action: AUDIT_ACTIONS.USER_REACTIVATED,
      entity: 'User',
      entityId: updated.id,
      metadata: { username: updated.username, role: updated.role },
    });

    return updated;
  }

  // Audit must never break the reactivation outcome.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during user reactivation; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
