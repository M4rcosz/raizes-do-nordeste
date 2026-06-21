import { Inject, Injectable } from '@nestjs/common';
import { Promotion } from '../../domain/entities/promotion.entity';
import {
  PROMOTION_REPOSITORY,
  type PromotionRepository,
} from '../../domain/repositories/promotion.repository';
import { PromotionNotFoundError } from '../errors/promotion-not-found.error';
import { PromotionsFetchError } from '../errors/promotions-fetch.error';

@Injectable()
export class FindPromotionByIdUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotions: PromotionRepository,
  ) {}

  async execute(promotionId: string): Promise<Promotion> {
    let promotion: Promotion | null;

    try {
      promotion = await this.promotions.findById(promotionId);
    } catch (err) {
      throw new PromotionsFetchError(`Could not retrieve promotion by id "${promotionId}".`, {
        cause: err,
      });
    }

    if (!promotion) {
      throw new PromotionNotFoundError(`Promotion with id "${promotionId}" not found.`);
    }

    return promotion;
  }
}
