import {
  isOrderSortField,
  isSortDirection,
  OrderSortField,
  type OrderSort,
  type SortDirection,
} from '@modules/orders/domain/value-objects/order-sort';
import {
  decodeCursorPayload,
  encodeCursorPayload,
  isSafeKeysetId,
  isSafeKeysetInstant,
} from '@shared/pagination/keyset-cursor';
import { InvalidOrderCursorError } from './errors/invalid-order-cursor.error';

/**
 * What a page token carries: the full sort key of the row it stops at (the sorted
 * column's value plus the id tie-break) and the sort it was minted under. The sort
 * travels with the token so the use case can reject a token replayed against a
 * different ordering (the keyset would otherwise describe a position in an order that
 * no longer applies).
 *
 * The only listing that does not use the shared timestamp codec: orders lets the caller
 * pick the sort column, so the payload needs the sort terms and a `sortValue` whose type
 * follows the chosen column. The base64url envelope is still shared.
 *
 * `sortValue` is what makes this a KEYSET rather than a row pointer: the query can
 * compare values directly instead of asking the database to locate a row. A positional
 * cursor (Prisma `cursor` + `skip: 1`) breaks when the row it names stops matching the
 * WHERE - filter by orderStatus, let that order transition, and the position shifts so
 * `skip: 1` silently eats the NEXT row. Measured on the promotions listing: a 5-row page
 * of 3 then 2 lost a row outright. Orders are just as mutable (status changes constantly),
 * so the same predicate style is used here.
 *
 * Deliberately carries no authorization data. The token is a position, never an
 * authorization input: the unit-scope filter is applied independently in the use case
 * and is what bounds visibility, whatever a forged token names.
 */
export interface OrderCursor {
  sortBy: OrderSortField;
  sortDir: SortDirection;
  /** ISO-8601 instant when sorting by createdAt; a 2dp decimal string for totalAmount. */
  sortValue: string;
  id: string;
}

export function encodeOrderCursor(id: string, sortValue: string, sort: OrderSort): string {
  const payload: OrderCursor = {
    sortBy: sort.field,
    sortDir: sort.direction,
    sortValue,
    id,
  };
  return encodeCursorPayload(payload);
}

export function decodeOrderCursor(token: string): OrderCursor {
  return decodeCursorPayload(token, isOrderCursor, InvalidOrderCursorError);
}

function isOrderCursor(value: unknown): value is OrderCursor {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate: Record<string, unknown> = { ...value };
  if (
    !isOrderSortField(candidate.sortBy) ||
    !isSortDirection(candidate.sortDir) ||
    typeof candidate.id !== 'string' ||
    !isSafeKeysetId(candidate.id) ||
    typeof candidate.sortValue !== 'string' ||
    candidate.sortValue.length === 0
  ) {
    return false;
  }

  // The value has to be readable as the sorted column's type, or the keyset comparison
  // would be built from garbage: an unparseable date becomes an Invalid Date, which
  // compares false against everything and silently returns an empty page.
  return candidate.sortBy === OrderSortField.CREATED_AT
    ? isSafeKeysetInstant(candidate.sortValue)
    : /^\d{1,8}(?:\.\d{1,2})?$/.test(candidate.sortValue);
}
