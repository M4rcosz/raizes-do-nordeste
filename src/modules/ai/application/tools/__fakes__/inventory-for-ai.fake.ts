import type {
  InventoryAiActor,
  InventoryForAi,
  InventoryForAiView,
  InventoryListForAiResult,
} from '@modules/inventory/application/ports/inventory-for-ai.port';

/**
 * In-memory InventoryForAi fake keyed by unit. Does NOT re-implement the unit-scope
 * check: the real service owns that rule (and has its own spec), so leaving it out
 * here keeps the registry's tests honest about what the registry itself forwards.
 */
export class FakeInventoryForAi implements InventoryForAi {
  private readonly stock = new Map<string, InventoryForAiView[]>();
  readonly calls: { businessUnitId: string; actor: InventoryAiActor }[] = [];
  hasMore = false;

  seed(businessUnitId: string, ...items: InventoryForAiView[]): this {
    this.stock.set(businessUnitId, items);
    return this;
  }

  listForActor(businessUnitId: string, actor: InventoryAiActor): Promise<InventoryListForAiResult> {
    this.calls.push({ businessUnitId, actor });
    return Promise.resolve({
      inventory: this.stock.get(businessUnitId) ?? [],
      hasMore: this.hasMore,
    });
  }
}
