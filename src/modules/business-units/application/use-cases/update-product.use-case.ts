import { Inject, Injectable, Logger } from '@nestjs/common';
import { Money } from '@shared/domain/value-objects/money';
import {
  AUDIT_LOGGER,
  type AuditLogInput,
  type AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { Product } from '../../domain/entities/product.entity';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../domain/repositories/product.repository';
import { ProductNotFoundError } from '../errors/product-not-found.error';

// Partial patch of a product's catalog attributes. price stays a decimal string
// at this border (cross-context/wire contract); it becomes Money before touching
// the domain.
export interface UpdateProductInput {
  name?: string;
  description?: string;
  price?: string;
  categoryId?: string;
  imageUrl?: string;
}

@Injectable()
export class UpdateProductUseCase {
  private readonly logger = new Logger(UpdateProductUseCase.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepository,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  // Read-modify-write: load the current product, apply the patch immutably, then
  // persist. Not optimistic-locked yet (see roadmap), so a concurrent edit can be
  // last-write-wins; the null from update() only guards a delete-in-between.
  async execute(id: string, input: UpdateProductInput, actorId: string): Promise<Product> {
    const current = await this.products.findById(id);
    if (!current) {
      throw new ProductNotFoundError(`Product with id "${id}" not found.`);
    }

    const patched = current.withUpdatedFields({
      name: input.name,
      description: input.description,
      price: input.price !== undefined ? Money.fromDecimalString(input.price) : undefined,
      categoryId: input.categoryId,
      imageUrl: input.imageUrl,
    });

    const updated = await this.products.update(patched);
    if (!updated) {
      throw new ProductNotFoundError(`Product with id "${id}" not found.`);
    }

    await this.tryAudit({
      userId: actorId,
      action: AUDIT_ACTIONS.PRODUCT_UPDATED,
      entity: 'Product',
      entityId: updated.id,
      // Only the names of the changed fields, never the raw values.
      metadata: { updatedFields: this.changedFieldNames(input) },
    });

    return updated;
  }

  // Derive audit field names from the fixed set of patchable keys, not from
  // Object.keys(input): the DTO carries a validation-only carrier field that
  // would otherwise leak into the audit trail as a forged field name.
  private changedFieldNames(input: UpdateProductInput): string[] {
    const patchableFields: (keyof UpdateProductInput)[] = [
      'name',
      'description',
      'price',
      'categoryId',
      'imageUrl',
    ];
    return patchableFields.filter((field) => input[field] !== undefined);
  }

  // Audit must never break the update outcome.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during product update; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
