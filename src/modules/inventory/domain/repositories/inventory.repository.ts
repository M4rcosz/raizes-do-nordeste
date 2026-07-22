import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import type { TimestampKeyset } from '@shared/pagination/keyset-cursor';
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
  take: number;
  keyset?: TimestampKeyset;
}

export interface InitializeInventoryInput {
  businessUnitId: string;
  productId: string;
  /** Opening balance; may be zero. */
  quantity: number;
  minQuantity: number;
  reason: string;
  /** Who created the row (manager on the initialize endpoint). */
  createdBy: string;
}

export interface InventoryRepository {
  findManyByUnit(input: FindInventoryByUnitInput): Promise<Inventory[]>;
  /**
   * Creates the first inventory row for a product at a unit and always writes the
   * opening IN ledger entry in the caller's `tx` (a zero opening balance still gets
   * an entry, so the row never lacks a genesis record). Relies on the
   * `(businessUnitId, productId)` unique constraint: throws
   * `InventoryAlreadyExistsError` when a row exists and
   * `InventoryProductNotFoundError` when the product or unit does not.
   */
  initialize(input: InitializeInventoryInput, tx: TransactionContext): Promise<Inventory>;
  /**
   * Applies the balance change and records the InventoryTransaction as one atomic
   * unit. `tx` is required: the update, re-read and ledger insert must share the
   * caller's transaction, so a movement can never land with its ledger entry
   * missing (or vice versa). Both ends of the balance are guarded in the WHERE,
   * so concurrent movements can never drive it out of range: the OUT decrement by
   * `quantity >= amount`, the IN increment by `quantity <= MAX - amount`.
   * Throws `InsufficientStockError` when an OUT cannot be satisfied (also when the
   * product has no inventory row - zero stock), `InventoryQuantityOverflowError`
   * when an IN would exceed `MAX_INVENTORY_QUANTITY`, and `InventoryNotFoundError`
   * when an IN targets a missing row. Returns the post-movement inventory.
   */
  applyMovement(input: ApplyMovementInput, tx: TransactionContext): Promise<Inventory>;
}

export const INVENTORY_REPOSITORY = Symbol('InventoryRepository');
