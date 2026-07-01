import type { TransactionContext } from '@shared/transaction/transaction-runner.port';

export const STOCK_RESTORATION = Symbol('StockRestoration');

export interface StockRestorationItem {
  productId: string;
  quantity: number;
}

export interface StockRestorationInput {
  businessUnitId: string;
  orderId: string;
  actorId: string;
  items: StockRestorationItem[];
}

/**
 * Capability published by the inventory context for the orders context to consume when an
 * order is cancelled: returns the deducted units as guarded IN movements. Runs inside the
 * cancellation transaction so the restock commits with the order's other compensations.
 */
export interface StockRestoration {
  restoreForOrder(input: StockRestorationInput, tx: TransactionContext): Promise<void>;
}
