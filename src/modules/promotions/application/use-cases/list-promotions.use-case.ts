import { Inject, Injectable } from '@nestjs/common';
import { buildCursorPage, type CursorPaginatedResult } from '@shared/pagination/pagination';
import { Promotion } from '../../domain/entities/promotion.entity';
import {
  PROMOTION_REPOSITORY,
  type PromotionRepository,
} from '../../domain/repositories/promotion.repository';
import { PromotionsFetchError } from '../errors/promotions-fetch.error';
import { decodePromotionCursor, encodePromotionCursor } from '../promotion-keyset-cursor';

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

    // Decode before the fetch: a malformed token is the caller's error (422), not a
    // repository failure, and must not surface as an outage.
    const keyset = cursor === undefined ? undefined : decodePromotionCursor(cursor);

    // Over-fetch by one to detect a next page, same as the product listings.
    let items: Promotion[];
    try {
      items = await this.promotions.findManyByBusinessUnit({
        businessUnitId,
        take: limit + 1,
        keyset,
      });
    } catch (err) {
      throw new PromotionsFetchError(
        `Could not list promotions for business unit "${businessUnitId}".`,
        { cause: err },
      );
    }

    return buildCursorPage(items, limit, (promotion) =>
      encodePromotionCursor(promotion.createdAt, promotion.id),
    );
  }
}
