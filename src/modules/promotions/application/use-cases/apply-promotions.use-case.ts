import { Inject, Injectable } from '@nestjs/common';
import { Money } from '@shared/domain/value-objects/money';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { Promotion } from '../../domain/entities/promotion.entity';
import {
  PROMOTION_REPOSITORY,
  type PromotionRepository,
} from '../../domain/repositories/promotion.repository';
import type {
  AppliedPromotion,
  ApplyPromotionInput,
  PromotionApplication,
  QuotePromotionInput,
} from '../ports/promotion-application.port';

/**
 * Implements the PROMOTION_APPLICATION port: selects at most one promotion for an order
 * and prices its discount, then records the OrderPromotion inside the order-creation tx.
 *
 * STACKING RULE (MVP): at most ONE promotion per order. We do not just take the first
 * candidate - we evaluate every eligible promotion and keep the single best (largest
 * discount). The selection is the explicit policy in `selectBest`; to allow N promotions
 * later, that method is the one seam to change (accumulate instead of max), and the port
 * return type would widen to a list.
 *
 * Two-step and deterministic, mirroring loyalty redemption: quoteDiscount prices the
 * chosen promotion (read-only) so the order can set its total before insert; applyForOrder
 * re-selects from the same snapshot and writes the OrderPromotion keyed to the new order id.
 */
@Injectable()
export class ApplyPromotionsUseCase implements PromotionApplication {
  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotions: PromotionRepository,
  ) {}

  async quoteDiscount(
    input: QuotePromotionInput,
    tx: TransactionContext,
  ): Promise<AppliedPromotion | null> {
    return this.resolveBest(input, tx);
  }

  async applyForOrder(
    input: ApplyPromotionInput,
    tx: TransactionContext,
  ): Promise<AppliedPromotion | null> {
    const chosen = await this.resolveBest(input, tx);
    if (!chosen) {
      return null;
    }

    await this.promotions.recordOrderPromotion(
      {
        orderId: input.orderId,
        promotionId: chosen.promotionId,
        discountApplied: chosen.discount,
      },
      tx,
    );

    return chosen;
  }

  /**
   * Loads the unit's active-in-window promotions and picks the single best-priced one
   * that is also eligible for this subtotal. Zero-discount candidates (eligible but the
   * type prices to 0) are ignored: recording a 0 OrderPromotion would be noise. Returns
   * null when nothing applies.
   */
  private async resolveBest(
    input: QuotePromotionInput,
    tx: TransactionContext,
  ): Promise<AppliedPromotion | null> {
    const subtotal = Money.fromDecimalString(input.subtotal);
    const candidates = await this.promotions.findActiveEligible(
      input.businessUnitId,
      input.now,
      tx,
    );

    return this.selectBest(candidates, subtotal, input.now);
  }

  /**
   * The stacking policy, isolated. Today: one winner = the promotion with the largest
   * positive discount. Ties break by the lexicographically smallest id, so the choice is
   * stable across the quote and apply passes (same input, same winner).
   */
  private selectBest(candidates: Promotion[], subtotal: Money, now: Date): AppliedPromotion | null {
    let bestId: string | null = null;
    let bestDiscount = Money.zero();

    for (const promotion of candidates) {
      const discount = promotion.quoteDiscount(subtotal, now);
      if (!discount.isPositive()) {
        continue;
      }
      if (
        bestId === null ||
        discount.greaterThan(bestDiscount) ||
        (discount.equals(bestDiscount) && promotion.id < bestId)
      ) {
        bestId = promotion.id;
        bestDiscount = discount;
      }
    }

    if (bestId === null) {
      return null;
    }
    return { promotionId: bestId, discount: bestDiscount.toDecimalString() };
  }
}
