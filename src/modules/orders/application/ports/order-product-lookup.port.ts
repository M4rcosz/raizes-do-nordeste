import type Big from 'big.js';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';

export const ORDER_PRODUCT_LOOKUP = Symbol('OrderProductLookup');

export interface ResolvedProduct {
  /** Authoritative price for the product at the business unit: BusinessUnitMenuItem.customPrice. */
  price: Big;
  /** Product.isActive - whether the product is enabled brand-wide. */
  isActive: boolean;
  /** BusinessUnitMenuItem.isAvailable - whether the unit is currently offering it. */
  isAvailable: boolean;
}

export interface OrderProductLookup {
  /**
   * Resolves the orderable state of each product at the given business unit.
   * A product is keyed in the returned map only when it is on that unit's menu
   * (a BusinessUnitMenuItem exists). Products not on the menu are omitted, so
   * callers must treat a missing entry as "not orderable at this unit".
   *
   * When `tx` is provided the read joins the caller's transaction, keeping the
   * validation and the order insert on the same atomic snapshot.
   */
  resolve(
    businessUnitId: string,
    productIds: string[],
    tx?: TransactionContext,
  ): Promise<Map<string, ResolvedProduct>>;
}
