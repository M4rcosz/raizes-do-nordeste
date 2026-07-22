import { Inject, Injectable } from '@nestjs/common';
import {
  PROMOTION_REPOSITORY,
  type PromotionRepository,
} from '@modules/promotions/domain/repositories/promotion.repository';
import type { Promotion } from '@modules/promotions/domain/entities/promotion.entity';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { buildCursorPage } from '@shared/pagination/pagination';
import type {
  PromotionAiActor,
  PromotionForAi,
  PromotionForAiView,
  PromotionListForAiResult,
} from '../ports/promotion-for-ai.port';

// Rows one AI listing may return. Small on purpose: every row is tokens metered
// against the caller's AI balance.
const AI_PAGE_SIZE = 10;

@Injectable()
export class PromotionForAiService implements PromotionForAi {
  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotions: PromotionRepository,
  ) {}

  async listForActor(
    businessUnitId: string,
    actor: PromotionAiActor,
  ): Promise<PromotionListForAiResult> {
    // Same rule UnitScopeGuard applies to the HTTP routes. A unit outside the claim
    // reads as empty rather than as an error: an error would confirm the unit exists.
    if (!PromotionForAiService.canSeeUnit(businessUnitId, actor)) {
      return { promotions: [], hasMore: false };
    }

    // Fetch one extra row to know whether another page exists.
    const items = await this.promotions.findManyByBusinessUnit({
      businessUnitId,
      take: AI_PAGE_SIZE + 1,
    });
    const page = buildCursorPage(items, AI_PAGE_SIZE);
    return {
      promotions: page.data.map((promotion) => PromotionForAiService.toView(promotion)),
      hasMore: page.meta.hasMore,
    };
  }

  private static canSeeUnit(businessUnitId: string, actor: PromotionAiActor): boolean {
    if (actor.role === UserRole.ADMIN) {
      return true;
    }
    return actor.businessUnitIds.includes(businessUnitId);
  }

  private static toView(promotion: Promotion): PromotionForAiView {
    return {
      id: promotion.id,
      name: promotion.name,
      discountType: promotion.discountType,
      discountValue: promotion.discountValue.toDecimalString(),
      minOrderValue: promotion.minOrderValue.toDecimalString(),
      startDate: promotion.startDate.toISOString(),
      endDate: promotion.endDate.toISOString(),
      isActive: promotion.isActive,
    };
  }
}
