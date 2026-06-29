import { Inject, Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class SetProductActiveUseCase {
  private readonly logger = new Logger(SetProductActiveUseCase.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepository,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  // Idempotent toggle: activating an already-active product (or deactivating an
  // already-inactive one) is a no-op that still returns the current state. We do
  // not read the prior flag, so there is no AlreadyActive/AlreadyInactive error.
  async execute(id: string, isActive: boolean, actorId: string): Promise<Product> {
    const updated = await this.products.setActive(id, isActive);

    if (!updated) {
      throw new ProductNotFoundError(`Product with id "${id}" not found.`);
    }

    await this.tryAudit({
      userId: actorId,
      action: isActive ? AUDIT_ACTIONS.PRODUCT_ACTIVATED : AUDIT_ACTIONS.PRODUCT_DEACTIVATED,
      entity: 'Product',
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
        message: 'Audit logger threw during product toggle; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
