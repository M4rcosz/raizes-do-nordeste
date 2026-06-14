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

    for (const item of input.items) {
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
}
