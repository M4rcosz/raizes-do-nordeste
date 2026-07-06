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

// Partial patch of a unit's contact attributes. cnpj is immutable (fiscal
// identity) and isActive has its own activate/deactivate routes, so neither
// belongs here.
export interface UpdateBusinessUnitInput {
  name?: string;
  address?: string;
  city?: string;
  phone?: string;
}

@Injectable()
export class UpdateBusinessUnitUseCase {
  private readonly logger = new Logger(UpdateBusinessUnitUseCase.name);

  constructor(
    @Inject(BUSINESS_UNIT_REPOSITORY)
    private readonly businessUnits: BusinessUnitRepository,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  // Read-modify-write: load the current unit, apply the patch immutably, then
  // persist. Not optimistic-locked yet (see roadmap), so a concurrent edit can be
  // last-write-wins; the null from update() only guards a delete-in-between.
  async execute(
    id: string,
    input: UpdateBusinessUnitInput,
    actorId: string,
  ): Promise<BusinessUnit> {
    const current = await this.businessUnits.findById(id);
    if (!current) {
      throw new BusinessUnitNotFoundError(`Business unit with id "${id}" not found.`);
    }

    const patched = current.withUpdatedFields({
      name: input.name,
      address: input.address,
      city: input.city,
      phone: input.phone,
    });

    const updated = await this.businessUnits.update(patched);
    if (!updated) {
      throw new BusinessUnitNotFoundError(`Business unit with id "${id}" not found.`);
    }

    await this.tryAudit({
      userId: actorId,
      action: AUDIT_ACTIONS.BUSINESS_UNIT_UPDATED,
      entity: 'BusinessUnit',
      entityId: updated.id,
      // Only the names of the changed fields, never the raw values.
      metadata: { updatedFields: this.changedFieldNames(input) },
    });

    return updated;
  }

  // Derive audit field names from the fixed set of patchable keys, not from
  // Object.keys(input): the DTO carries a validation-only carrier field that
  // would otherwise leak into the audit trail as a forged field name.
  private changedFieldNames(input: UpdateBusinessUnitInput): string[] {
    const patchableFields: (keyof UpdateBusinessUnitInput)[] = ['name', 'address', 'city', 'phone'];
    return patchableFields.filter((field) => input[field] !== undefined);
  }

  // Audit must never break the update outcome.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during business unit update; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
