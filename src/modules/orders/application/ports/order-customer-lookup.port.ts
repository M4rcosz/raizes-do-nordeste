import type { TransactionContext } from '@shared/transaction/transaction-runner.port';

export const ORDER_CUSTOMER_LOOKUP = Symbol('OrderCustomerLookup');

export interface OrderCustomerLookup {
  /**
   * Whether the given id may be recorded as an order's customer: the user exists, is
   * a CUSTOMER, and is active. Returns a bare boolean on purpose - orders must not
   * learn WHY a binding is refused, or an attendant could probe the id space to find
   * which UUIDs belong to staff.
   *
   * When `tx` is provided the read joins the caller's transaction. That narrows the
   * window for a concurrent deactivation but does not close it: under READ COMMITTED
   * this read takes no row lock, so treat the result as "was bindable a moment ago".
   */
  isBindableCustomer(customerId: string, tx?: TransactionContext): Promise<boolean>;
}
