import { Inject, Injectable } from '@nestjs/common';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
} from '../../domain/repositories/inventory.repository';
import { InventoryTransactionType } from '../../domain/value-objects/inventory-transaction-type';
import type {
  StockRestoration,
  StockRestorationInput,
  StockRestorationItem,
} from '../ports/stock-restoration.port';

/**
 * Implements the STOCK_RESTORATION port: returns an order's deducted units to stock as
 * guarded IN movements, the mirror of DeductStockForOrder. Runs inside the caller's
 * cancellation transaction, so a failure rolls the whole cancellation back.
 *
 * An IN whose balance would exceed MAX_INVENTORY_QUANTITY throws
 * InventoryQuantityOverflowError and blocks the cancellation. That is deliberate: the
 * units cannot be returned without corrupting the balance, and silently dropping them
 * would break `balance derives from the ledger`. It needs a stock within a hair of
 * int4 max to trigger, and it aborts before the refund runs, so the saga stays
 * consistent. Previously this same case surfaced as a raw 500 from Postgres.
 */
@Injectable()
export class RestoreStockForOrderUseCase implements StockRestoration {
  constructor(
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventories: InventoryRepository,
  ) {}

  async restoreForOrder(input: StockRestorationInput, tx: TransactionContext): Promise<void> {
    // Collapse repeated product lines so each product gets one IN, mirroring the deduction.
    for (const item of this.aggregateByProduct(input.items)) {
      await this.inventories.applyMovement(
        {
          businessUnitId: input.businessUnitId,
          productId: item.productId,
          type: InventoryTransactionType.IN,
          quantity: item.quantity,
          reason: `Stock restored for cancelled order ${input.orderId}`,
          createdBy: input.actorId,
          orderId: input.orderId,
        },
        tx,
      );
    }
  }

  /** Sums quantities per product, keeping first-seen order (Map preserves insertion). */
  private aggregateByProduct(items: StockRestorationItem[]): StockRestorationItem[] {
    const totals = new Map<string, number>();
    for (const { productId, quantity } of items) {
      totals.set(productId, (totals.get(productId) ?? 0) + quantity);
    }
    return [...totals].map(([productId, quantity]) => ({ productId, quantity }));
  }
}
