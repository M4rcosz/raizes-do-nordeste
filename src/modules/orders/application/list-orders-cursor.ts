import {
  isOrderSortField,
  isSortDirection,
  type OrderSort,
  type OrderSortField,
  type SortDirection,
} from '@modules/orders/domain/value-objects/order-sort';
import { InvalidOrderCursorError } from './errors/invalid-order-cursor.error';

/**
 * What a page token carries: the row it stops at plus the sort it was minted under.
 * The sort travels with the token so the use case can reject a token replayed against
 * a different ordering (the row cursor would silently produce a wrong page).
 * Deliberately carries no authorization data. The token is a position, never an
 * authorization input: the unit-scope filter is applied independently in the use case
 * and is what bounds visibility, whatever id a forged token names.
 */
export interface OrderCursor {
  sortBy: OrderSortField;
  sortDir: SortDirection;
  id: string;
}

/** base64url of the JSON payload. Obfuscation only, not a signature - never trust the contents. */
export function encodeOrderCursor(id: string, sort: OrderSort): string {
  const payload: OrderCursor = { sortBy: sort.field, sortDir: sort.direction, id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeOrderCursor(token: string): OrderCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch (err) {
    throw new InvalidOrderCursorError('Invalid pagination cursor.', { cause: err });
  }

  if (!isOrderCursor(parsed)) {
    throw new InvalidOrderCursorError('Invalid pagination cursor.');
  }

  return parsed;
}

function isOrderCursor(value: unknown): value is OrderCursor {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate: Record<string, unknown> = { ...value };
  return (
    isOrderSortField(candidate.sortBy) &&
    isSortDirection(candidate.sortDir) &&
    typeof candidate.id === 'string' &&
    candidate.id.length > 0
  );
}
