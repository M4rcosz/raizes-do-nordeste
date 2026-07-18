import type {
  PromotionAiActor,
  PromotionForAi,
  PromotionForAiView,
  PromotionListForAiResult,
} from '@modules/promotions/application/ports/promotion-for-ai.port';

/**
 * In-memory PromotionForAi fake keyed by unit. Does NOT re-implement the unit-scope
 * check - the real service owns that rule and has its own spec.
 */
export class FakePromotionForAi implements PromotionForAi {
  private readonly promotions = new Map<string, PromotionForAiView[]>();
  readonly calls: { businessUnitId: string; actor: PromotionAiActor }[] = [];
  hasMore = false;

  seed(businessUnitId: string, ...promotions: PromotionForAiView[]): this {
    this.promotions.set(businessUnitId, promotions);
    return this;
  }

  listForActor(businessUnitId: string, actor: PromotionAiActor): Promise<PromotionListForAiResult> {
    this.calls.push({ businessUnitId, actor });
    return Promise.resolve({
      promotions: this.promotions.get(businessUnitId) ?? [],
      hasMore: this.hasMore,
    });
  }
}
