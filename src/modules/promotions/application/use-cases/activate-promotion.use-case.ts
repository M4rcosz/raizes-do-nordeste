import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUDIT_LOGGER,
  type AuditLogInput,
  type AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { Promotion } from '../../domain/entities/promotion.entity';
import {
  PROMOTION_REPOSITORY,
  type PromotionRepository,
} from '../../domain/repositories/promotion.repository';
import { PromotionNotFoundError } from '../errors/promotion-not-found.error';
import { PromotionsFetchError } from '../errors/promotions-fetch.error';
import { actorOwnsUnit, type PromotionActor } from '../promotion-actor';

@Injectable()
export class ActivatePromotionUseCase {
  private readonly logger = new Logger(ActivatePromotionUseCase.name);

  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotions: PromotionRepository,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  async execute(promotionId: string, actor: PromotionActor, actorId: string): Promise<Promotion> {
    let existing: Promotion | null;
    try {
      existing = await this.promotions.findById(promotionId);
    } catch (err) {
      throw new PromotionsFetchError(`Could not retrieve promotion by id "${promotionId}".`, {
        cause: err,
      });
    }

    // Same 404 for missing and not-yours so a foreign unit's promotion never
    // leaks its existence to a scoped actor.
    if (!existing || !actorOwnsUnit(actor, existing.businessUnitId)) {
      throw new PromotionNotFoundError(`Promotion with id "${promotionId}" not found.`);
    }

    // Idempotent: activating an already-active promotion is a no-op write.
    const updated = await this.promotions.update(promotionId, { isActive: true });

    await this.tryAudit({
      userId: actorId,
      action: AUDIT_ACTIONS.PROMOTION_ACTIVATED,
      entity: 'Promotion',
      entityId: updated.id,
      metadata: { businessUnitId: updated.businessUnitId, isActive: true },
    });

    return updated;
  }

  // Audit must never break the toggle outcome.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during promotion activation; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
