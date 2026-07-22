import { Inject, Injectable } from '@nestjs/common';
import { buildCursorPage, type CursorPaginatedResult } from '@shared/pagination/pagination';
import { Promotion } from '../../domain/entities/promotion.entity';
import {
  PROMOTION_REPOSITORY,
  type PromotionRepository,
} from '../../domain/repositories/promotion.repository';
import { PromotionsFetchError } from '../errors/promotions-fetch.error';
import { decodePromotionCursor, encodePromotionCursor } from '../promotion-keyset-cursor';

export interface ListActivePromotionsInput {
  businessUnitId: string;
  cursor?: string;
  limit: number;
}

/**
 * Customer-facing promotion listing. Unlike ListPromotionsUseCase (back office), this
 * one never returns inactive, expired or not-yet-started promotions: a customer must
 * only ever see what they could actually get right now.
 */
@Injectable()
export class ListActivePromotionsUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotions: PromotionRepository,
  ) {}

  async execute(input: ListActivePromotionsInput): Promise<CursorPaginatedResult<Promotion>> {
    const { businessUnitId, cursor, limit } = input;

    // The clock is read once here so every row in a page is judged against the same
    // instant, and so the use case stays the single place that decides "now".
    const now = new Date();

    // Decode before the fetch: a malformed token is the caller's error (422), not a
    // repository failure, and must not surface as an outage.
    const keyset = cursor === undefined ? undefined : decodePromotionCursor(cursor);

    // Over-fetch by one to detect a next page, same as the back-office listing.
    let items: Promotion[];
    try {
      items = await this.promotions.findManyActive({
        businessUnitId,
        now,
        take: limit + 1,
        keyset,
      });
    } catch (err) {
      throw new PromotionsFetchError(
        `Could not list active promotions for business unit "${businessUnitId}".`,
        { cause: err },
      );
    }

    // The next page's token carries the whole sort key, not just the id, so the keyset
    // predicate can be rebuilt without re-reading the row it points at.
    return buildCursorPage(items, limit, (promotion) =>
      encodePromotionCursor(promotion.createdAt, promotion.id),
    );
  }
}
