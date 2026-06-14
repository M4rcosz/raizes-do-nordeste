import { Inject, Injectable } from '@nestjs/common';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
} from '../../domain/repositories/inventory.repository';
import { InventoryTransactionType } from '../../domain/value-objects/inventory-transaction-type';
import type {
  LowStockItem,
  StockDeduction,
  StockDeductionInput,
  StockDeductionItem,
  StockDeductionResult,
} from '../ports/stock-deduction.port';

/**
 * Implements the STOCK_DEDUCTION port (RN-28/29). Always runs inside the
 * caller's transaction: the first item without enough stock throws
 * `InsufficientStockError`, rolling back the order and every deduction already
 * applied - items never go out partially.
 */
@Injectable()
export class DeductStockForOrderUseCase implements StockDeduction {
  constructor(
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventories: InventoryRepository,
  ) {}

  async deductForOrder(
    input: StockDeductionInput,
    tx: TransactionContext,
  ): Promise<StockDeductionResult> {
    const lowStock: LowStockItem[] = [];

    // An order can list the same product on several lines; collapse them so each
    // product gets one guarded OUT (and at most one STOCK_ALERT), not one per line.
    for (const item of this.aggregateByProduct(input.items)) {
      const inventory = await this.inventories.applyMovement(
        {
          businessUnitId: input.businessUnitId,
          productId: item.productId,
          type: InventoryTransactionType.OUT,
          quantity: item.quantity,
          reason: `Stock deducted for order ${input.orderId}`,
          createdBy: input.actorId,
          orderId: input.orderId,
        },
        tx,
      );

      if (inventory.isLowStock()) {
        lowStock.push({
          productId: item.productId,
          quantity: inventory.quantity,
          minQuantity: inventory.minQuantity,
        });
      }
    }

    return { lowStock };
  }

  /** Sums quantities per product, keeping first-seen order (Map preserves insertion). */
  private aggregateByProduct(items: StockDeductionItem[]): StockDeductionItem[] {
    const totals = new Map<string, number>();
    for (const { productId, quantity } of items) {
      totals.set(productId, (totals.get(productId) ?? 0) + quantity);
    }
    return [...totals].map(([productId, quantity]) => ({ productId, quantity }));
  }
}
