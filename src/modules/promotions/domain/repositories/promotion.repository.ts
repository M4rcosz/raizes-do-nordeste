import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import type { CursorPaginationParams } from '@shared/pagination/pagination';
import { Promotion } from '../entities/promotion.entity';
import type { DiscountType } from '../value-objects/discount-type';

/** Money fields arrive as 2dp decimal strings (write border); the repo passes them to Prisma. */
export interface CreatePromotionInput {
  businessUnitId: string;
  name: string;
  discountType: DiscountType;
  discountValue: string;
  minOrderValue: string;
  startDate: Date;
  endDate: Date;
  isActive?: boolean;
}

/** All fields optional: only the supplied ones are updated. */
export interface UpdatePromotionInput {
  name?: string;
  discountType?: DiscountType;
  discountValue?: string;
  minOrderValue?: string;
  startDate?: Date;
  endDate?: Date;
  isActive?: boolean;
}

export interface FindPromotionsByBusinessUnitInput {
  businessUnitId: string;
  pagination: CursorPaginationParams;
}

/**
 * Keyset position for the public listing: the sort key of the last row of the previous
 * page, not a row id to seek to. Deliberately NOT CursorPaginationParams - this listing
 * cannot use a positional cursor (see findManyActive).
 */
export interface ActivePromotionKeyset {
  createdAt: Date;
  id: string;
}

export interface FindActivePromotionsInput {
  businessUnitId: string;
  /** Reference instant for the [startDate, endDate) window check. */
  now: Date;
  take: number;
  keyset?: ActivePromotionKeyset;
}

export interface RecordOrderPromotionInput {
  orderId: string;
  promotionId: string;
  /** The priced discount for this order as a 2dp decimal string. */
  discountApplied: string;
}

export interface PromotionRepository {
  create(input: CreatePromotionInput): Promise<Promotion>;
  findById(id: string): Promise<Promotion | null>;
  findManyByBusinessUnit(input: FindPromotionsByBusinessUnitInput): Promise<Promotion[]>;
  /**
   * Customer-facing listing: only promotions flagged active with `now` inside their
   * [startDate, endDate) window. Same predicate as findActiveEligible, but paginated
   * and without a transaction - this one serves a public read, not order creation.
   *
   * Paginated by an explicit keyset predicate rather than a row cursor, because the
   * filter is time-varying: the previous page's last row can stop matching before the
   * next request (it expires, or an admin deactivates it), and a positional cursor then
   * silently drops a different row. Values, not positions.
   */
  findManyActive(input: FindActivePromotionsInput): Promise<Promotion[]>;
  update(id: string, input: UpdatePromotionInput): Promise<Promotion>;
  /**
   * Candidates for automatic application: promotions of this unit flagged active with
   * `now` inside their [startDate, endDate) window. The subtotal/min-order gate is the
   * domain's job (PromotionRules), not the query's, so eligibility stays in one place.
   * `tx` lets the read share the order-creation transaction's snapshot.
   */
  findActiveEligible(
    businessUnitId: string,
    now: Date,
    tx?: TransactionContext,
  ): Promise<Promotion[]>;
  /** Inserts the OrderPromotion row on the caller's tx, inside the order-creation unit of work. */
  recordOrderPromotion(input: RecordOrderPromotionInput, tx: TransactionContext): Promise<void>;
}

export const PROMOTION_REPOSITORY = Symbol('PromotionRepository');
