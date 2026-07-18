import { Inject, Injectable } from '@nestjs/common';
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
} from '@modules/inventory/domain/repositories/inventory.repository';
import type { Inventory } from '@modules/inventory/domain/entities/inventory.entity';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { buildCursorPage } from '@shared/pagination/pagination';
import type {
  InventoryAiActor,
  InventoryForAi,
  InventoryForAiView,
  InventoryListForAiResult,
} from '../ports/inventory-for-ai.port';

// Rows one AI listing may return. Small on purpose: every row is tokens metered
// against the caller's AI balance.
const AI_PAGE_SIZE = 10;

@Injectable()
export class InventoryForAiService implements InventoryForAi {
  constructor(
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventory: InventoryRepository,
  ) {}

  async listForActor(
    businessUnitId: string,
    actor: InventoryAiActor,
  ): Promise<InventoryListForAiResult> {
    // Same rule UnitScopeGuard applies to the HTTP routes. A unit outside the claim
    // reads as empty rather than as an error: an error would confirm the unit exists,
    // and the model would surface that to the user.
    if (!InventoryForAiService.canSeeUnit(businessUnitId, actor)) {
      return { inventory: [], hasMore: false };
    }

    // Fetch one extra row to know whether another page exists.
    const items = await this.inventory.findManyByUnit({
      businessUnitId,
      pagination: { take: AI_PAGE_SIZE + 1 },
    });
    const page = buildCursorPage(items, AI_PAGE_SIZE);
    return {
      inventory: page.data.map((row) => InventoryForAiService.toView(row)),
      hasMore: page.meta.hasMore,
    };
  }

  private static canSeeUnit(businessUnitId: string, actor: InventoryAiActor): boolean {
    if (actor.role === UserRole.ADMIN) {
      return true;
    }
    return actor.businessUnitIds.includes(businessUnitId);
  }

  private static toView(inventory: Inventory): InventoryForAiView {
    return {
      productId: inventory.productId,
      quantity: inventory.quantity,
      minQuantity: inventory.minQuantity,
      isLowStock: inventory.isLowStock(),
    };
  }
}
