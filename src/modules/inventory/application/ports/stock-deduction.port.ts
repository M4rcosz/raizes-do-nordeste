import type { TransactionContext } from '@shared/transaction/transaction-runner.port';

export const STOCK_DEDUCTION = Symbol('StockDeduction');

export interface StockDeductionItem {
  productId: string;
  quantity: number;
}

/** A product whose balance fell to or below its threshold after the deduction. */
export interface LowStockItem {
  productId: string;
  quantity: number;
  minQuantity: number;
}

export interface StockDeductionInput {
  businessUnitId: string;
  orderId: string;
  actorId: string;
  items: StockDeductionItem[];
}

export interface StockDeductionResult {
  lowStock: LowStockItem[];
}

/**
 * Capability published by the inventory context for the orders context to consume.
 * Runs inside the caller's transaction: an `InsufficientStockError` on any item
 * rolls back the whole order, so no partial deduction ever lands.
 */
export interface StockDeduction {
  deductForOrder(input: StockDeductionInput, tx: TransactionContext): Promise<StockDeductionResult>;
}
