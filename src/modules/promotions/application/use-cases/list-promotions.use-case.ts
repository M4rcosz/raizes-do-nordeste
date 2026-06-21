import { Inject, Injectable } from '@nestjs/common';
import { buildCursorMeta, type CursorPaginatedResult } from '@shared/pagination/pagination';
import { Promotion } from '../../domain/entities/promotion.entity';
import {
  PROMOTION_REPOSITORY,
  type PromotionRepository,
} from '../../domain/repositories/promotion.repository';
import { PromotionsFetchError } from '../errors/promotions-fetch.error';

export interface ListPromotionsInput {
  businessUnitId: string;
  cursor?: string;
  limit: number;
}

@Injectable()
export class ListPromotionsUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotions: PromotionRepository,
  ) {}

  async execute(input: ListPromotionsInput): Promise<CursorPaginatedResult<Promotion>> {
    const { businessUnitId, cursor, limit } = input;

    // Over-fetch by one to detect a next page, same as the product listings.
    let items: Promotion[];
    try {
      items = await this.promotions.findManyByBusinessUnit({
        businessUnitId,
        pagination: { cursor, take: limit + 1 },
      });
    } catch (err) {
      throw new PromotionsFetchError(
        `Could not list promotions for business unit "${businessUnitId}".`,
        { cause: err },
      );
    }

    const hasMore = items.length > limit;
    const trimmed = hasMore ? items.slice(0, limit) : items;
    const lastItemId = trimmed[trimmed.length - 1]?.id;

    return {
      data: trimmed,
      meta: buildCursorMeta(limit, hasMore, lastItemId),
    };
  }
}
