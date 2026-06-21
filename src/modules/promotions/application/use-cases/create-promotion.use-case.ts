import { Inject, Injectable } from '@nestjs/common';
import { Promotion } from '../../domain/entities/promotion.entity';
import {
  type CreatePromotionInput,
  PROMOTION_REPOSITORY,
  type PromotionRepository,
} from '../../domain/repositories/promotion.repository';
import { PromotionNotEligibleError } from '../../domain/errors/promotion-not-eligible.error';

@Injectable()
export class CreatePromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotions: PromotionRepository,
  ) {}

  async execute(input: CreatePromotionInput): Promise<Promotion> {
    // A window that ends at or before it starts can never be eligible. Reject at the
    // door (422) so we never persist a promotion that is dead on arrival. DTO validation
    // does not see across two fields, so this invariant lives here.
    if (input.endDate.getTime() <= input.startDate.getTime()) {
      throw new PromotionNotEligibleError(
        `Promotion endDate (${input.endDate.toISOString()}) must be after startDate (${input.startDate.toISOString()}).`,
      );
    }
    return this.promotions.create(input);
  }
}
