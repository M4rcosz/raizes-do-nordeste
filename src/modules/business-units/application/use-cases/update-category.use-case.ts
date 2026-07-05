import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUDIT_LOGGER,
  type AuditLogInput,
  type AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { Category } from '../../domain/entities/category.entity';
import {
  CATEGORY_REPOSITORY,
  type CategoryRepository,
} from '../../domain/repositories/category.repository';
import { CategoryNotFoundError } from '../../domain/errors/category-not-found.error';

// Partial patch of a category's attributes. Unlike Product, isActive is editable
// here (the category has no separate activate/deactivate route).
export interface UpdateCategoryInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

@Injectable()
export class UpdateCategoryUseCase {
  private readonly logger = new Logger(UpdateCategoryUseCase.name);

  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepository,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  // Read-modify-write: load the current category, apply the patch immutably, then
  // persist. Not optimistic-locked yet (see roadmap), so a concurrent edit can be
  // last-write-wins; the null from update() only guards a delete-in-between.
  async execute(id: string, input: UpdateCategoryInput, actorId: string): Promise<Category> {
    const current = await this.categories.findById(id);
    if (!current) {
      throw new CategoryNotFoundError(`Category with id "${id}" not found.`);
    }

    const patched = current.withUpdatedFields({
      name: input.name,
      description: input.description,
      isActive: input.isActive,
    });

    const updated = await this.categories.update(patched);
    if (!updated) {
      throw new CategoryNotFoundError(`Category with id "${id}" not found.`);
    }

    await this.tryAudit({
      userId: actorId,
      action: AUDIT_ACTIONS.CATEGORY_UPDATED,
      entity: 'Category',
      entityId: updated.id,
      // Only the names of the changed fields, never the raw values.
      metadata: { updatedFields: this.changedFieldNames(input) },
    });

    return updated;
  }

  // Derive audit field names from the fixed set of patchable keys, not from
  // Object.keys(input): the DTO carries a validation-only carrier field that
  // would otherwise leak into the audit trail as a forged field name.
  private changedFieldNames(input: UpdateCategoryInput): string[] {
    const patchableFields: (keyof UpdateCategoryInput)[] = ['name', 'description', 'isActive'];
    return patchableFields.filter((field) => input[field] !== undefined);
  }

  // Audit must never break the update outcome.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during category update; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
