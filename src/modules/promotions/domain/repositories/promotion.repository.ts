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
