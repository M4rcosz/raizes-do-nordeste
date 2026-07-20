import { Inject, Injectable } from '@nestjs/common';
import { Promotion } from '../../domain/entities/promotion.entity';
import {
  PROMOTION_REPOSITORY,
  type PromotionRepository,
  type UpdatePromotionInput,
} from '../../domain/repositories/promotion.repository';
import { PromotionNotFoundError } from '../errors/promotion-not-found.error';
import { PromotionsFetchError } from '../errors/promotions-fetch.error';
import { PromotionNotEligibleError } from '../../domain/errors/promotion-not-eligible.error';
import { FreeItemNotSupportedError } from '../../domain/errors/free-item-not-supported.error';
import { DiscountType } from '../../domain/value-objects/discount-type';
import { actorOwnsUnit, type PromotionActor } from '../promotion-actor';

@Injectable()
export class UpdatePromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotions: PromotionRepository,
  ) {}

  async execute(
    promotionId: string,
    input: UpdatePromotionInput,
    actor: PromotionActor,
  ): Promise<Promotion> {
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

    // Closes the other door into a FREE_ITEM row: patching discountType on an existing
    // promotion. Same rule as creation, checked only when the field is actually being
    // set - a legacy FREE_ITEM row can still be patched (e.g. deactivated) otherwise.
    if (input.discountType === DiscountType.FREE_ITEM) {
      throw new FreeItemNotSupportedError(
        'FREE_ITEM promotions are not supported: the schema does not model a target item.',
      );
    }

    // A partial update can leave the window invalid (end <= start). Validate against the
    // effective values: the patched field if present, the persisted one otherwise.
    const startDate = input.startDate ?? existing.startDate;
    const endDate = input.endDate ?? existing.endDate;
    if (endDate.getTime() <= startDate.getTime()) {
      throw new PromotionNotEligibleError(
        `Promotion endDate (${endDate.toISOString()}) must be after startDate (${startDate.toISOString()}).`,
      );
    }

    return this.promotions.update(promotionId, input);
  }
}
