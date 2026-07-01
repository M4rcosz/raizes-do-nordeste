import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import type { CursorPaginationParams } from '@shared/pagination/pagination';
import { Inventory } from '../entities/inventory.entity';
import type { ManualMovementType } from '../value-objects/inventory-transaction-type';

export interface ApplyMovementInput {
  businessUnitId: string;
  productId: string;
  type: ManualMovementType;
  /** Units moved; always positive - `type` carries the direction. */
  quantity: number;
  reason: string;
  /** Who triggered the movement (manager on adjust, customer/attendant on an order). */
  createdBy: string;
  /** Present when the movement was caused by an order (RN-28). */
  orderId?: string;
}

export interface FindInventoryByUnitInput {
  businessUnitId: string;
  pagination: CursorPaginationParams;
}

export interface InventoryRepository {
  findManyByUnit(input: FindInventoryByUnitInput): Promise<Inventory[]>;
  /**
   * Applies the balance change and records the InventoryTransaction as one atomic
   * unit. `tx` is required: the update, re-read and ledger insert must share the
   * caller's transaction, so a movement can never land with its ledger entry
   * missing (or vice versa). The OUT decrement is guarded (`quantity >= amount`
   * in the WHERE), so a concurrent movement can never drive the balance below
   * zero. Throws `InsufficientStockError` when an OUT cannot be satisfied (also
   * when the product has no inventory row - zero stock) and `InventoryNotFoundError`
   * when an IN targets a missing row. Returns the post-movement inventory.
   */
  applyMovement(input: ApplyMovementInput, tx: TransactionContext): Promise<Inventory>;
}

export const INVENTORY_REPOSITORY = Symbol('InventoryRepository');
