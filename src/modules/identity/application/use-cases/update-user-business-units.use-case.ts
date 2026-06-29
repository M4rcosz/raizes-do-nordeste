import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUDIT_LOGGER,
  type AuditLogInput,
  type AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@shared/transaction/transaction-runner.port';
import { User } from '@modules/identity/domain/entities/user.entity';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { UserCreationForbiddenError } from '../errors/user-creation-forbidden.error';
import { UserNotFoundError } from '../errors/user-not-found.error';

export interface UpdateUserBusinessUnitsActor {
  id: string;
  role: UserRole;
}

// Roles that carry no unit binding by design: assigning units to them is
// meaningless, so the operation is rejected rather than silently stored.
const UNIT_UNBOUND_ROLES: ReadonlySet<UserRole> = new Set([UserRole.ADMIN, UserRole.CUSTOMER]);

@Injectable()
export class UpdateUserBusinessUnitsUseCase {
  private readonly logger = new Logger(UpdateUserBusinessUnitsUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  // Admin-only (the controller gates @Roles ADMIN; re-checked here for defense in
  // depth). Replaces the target's unit links with exactly `businessUnitIds`.
  async execute(
    actor: UpdateUserBusinessUnitsActor,
    targetId: string,
    businessUnitIds: string[],
  ): Promise<User> {
    if (actor.role !== UserRole.ADMIN) {
      throw new UserCreationForbiddenError(
        `Role ${actor.role} is not allowed to change a user's business units.`,
      );
    }

    const target = await this.users.findById(targetId);
    if (!target) {
      throw new UserNotFoundError(`User ${targetId} not found.`);
    }

    if (UNIT_UNBOUND_ROLES.has(target.role)) {
      throw new UserCreationForbiddenError(`A ${target.role} user is not bound to business units.`);
    }

    // Replace the link set atomically. An invalid unit id surfaces from the repo
    // as InvalidBusinessUnitError (P2003); a vanished user yields null -> 404.
    const updated = await this.transactions.run((tx) =>
      this.users.replaceBusinessUnits(targetId, businessUnitIds, actor.id, tx),
    );
    if (!updated) {
      throw new UserNotFoundError(`User ${targetId} not found.`);
    }

    await this.tryAudit({
      userId: actor.id,
      action: AUDIT_ACTIONS.USER_BUSINESS_UNITS_CHANGED,
      entity: 'User',
      entityId: updated.id,
      metadata: { businessUnitIds: updated.businessUnitIds },
    });

    return updated;
  }

  // Audit must never break the outcome.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during business-units change; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
