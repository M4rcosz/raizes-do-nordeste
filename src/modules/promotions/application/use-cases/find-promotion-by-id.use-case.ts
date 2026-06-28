import { Inject, Injectable } from '@nestjs/common';
import { Promotion } from '../../domain/entities/promotion.entity';
import {
  PROMOTION_REPOSITORY,
  type PromotionRepository,
} from '../../domain/repositories/promotion.repository';
import { PromotionNotFoundError } from '../errors/promotion-not-found.error';
import { PromotionsFetchError } from '../errors/promotions-fetch.error';
import { actorOwnsUnit, type PromotionActor } from '../promotion-actor';

@Injectable()
export class FindPromotionByIdUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotions: PromotionRepository,
  ) {}

  async execute(promotionId: string, actor: PromotionActor): Promise<Promotion> {
    let promotion: Promotion | null;

    try {
      promotion = await this.promotions.findById(promotionId);
    } catch (err) {
      throw new PromotionsFetchError(`Could not retrieve promotion by id "${promotionId}".`, {
        cause: err,
      });
    }

    // Same 404 for missing and not-yours so a foreign unit's promotion never
    // leaks its existence to a scoped actor.
    if (!promotion || !actorOwnsUnit(actor, promotion.businessUnitId)) {
      throw new PromotionNotFoundError(`Promotion with id "${promotionId}" not found.`);
    }

    return promotion;
  }
}
