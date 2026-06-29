import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUDIT_LOGGER,
  type AuditLogInput,
  type AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { BusinessUnit } from '../../domain/entities/business-unit.entity';
import {
  BUSINESS_UNIT_REPOSITORY,
  type BusinessUnitRepository,
} from '../../domain/repositories/business-unit.repository';
import { BusinessUnitNotFoundError } from '../errors/business-unit-not-found.error';

@Injectable()
export class SetBusinessUnitActiveUseCase {
  private readonly logger = new Logger(SetBusinessUnitActiveUseCase.name);

  constructor(
    @Inject(BUSINESS_UNIT_REPOSITORY)
    private readonly businessUnits: BusinessUnitRepository,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  // Idempotent toggle: activating an already-active unit (or deactivating an
  // already-inactive one) is a no-op that still returns the current state. We do
  // not read the prior flag, so there is no AlreadyActive/AlreadyInactive error.
  async execute(id: string, isActive: boolean, actorId: string): Promise<BusinessUnit> {
    const updated = await this.businessUnits.setActive(id, isActive);

    if (!updated) {
      throw new BusinessUnitNotFoundError(`Business unit with id "${id}" not found.`);
    }

    await this.tryAudit({
      userId: actorId,
      action: isActive
        ? AUDIT_ACTIONS.BUSINESS_UNIT_ACTIVATED
        : AUDIT_ACTIONS.BUSINESS_UNIT_DEACTIVATED,
      entity: 'BusinessUnit',
      entityId: updated.id,
      metadata: { isActive },
    });

    return updated;
  }

  // Audit must never break the toggle outcome.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during business unit toggle; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
