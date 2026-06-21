import { Inject, Injectable } from '@nestjs/common';
import { Promotion } from '../../domain/entities/promotion.entity';
import {
  PROMOTION_REPOSITORY,
  type PromotionRepository,
  type UpdatePromotionInput,
} from '../../domain/repositories/promotion.repository';
import { PromotionNotFoundError } from '../errors/promotion-not-found.error';
import { PromotionNotEligibleError } from '../../domain/errors/promotion-not-eligible.error';

@Injectable()
export class UpdatePromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotions: PromotionRepository,
  ) {}

  async execute(promotionId: string, input: UpdatePromotionInput): Promise<Promotion> {
    const existing = await this.promotions.findById(promotionId);
    if (!existing) {
      throw new PromotionNotFoundError(`Promotion with id "${promotionId}" not found.`);
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
