import type { Order } from '@modules/orders/domain/entities/order.entity';
import { OrderSortField } from '@modules/orders/domain/value-objects/order-sort';

/**
 * The sorted column's value for an order, as the string form that travels in a page
 * token. Shared by both listing use cases so the token they mint is identical in shape
 * and one keyset predicate can read either.
 *
 * Money stays a decimal string end to end: turning totalAmount into a number here would
 * round-trip it through a float on the way back into the SQL comparison.
 */
export function sortValueOf(order: Order, field: OrderSortField): string {
  return field === OrderSortField.CREATED_AT
    ? order.createdAt.toISOString()
    : order.totalAmount.toDecimalString();
}
