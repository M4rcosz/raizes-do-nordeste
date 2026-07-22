/**
 * There is deliberately no shared "repository pagination params" type here any more.
 * Every listing takes `take` plus an optional keyset (see
 * `@shared/pagination/keyset-cursor`), because a positional row cursor drops rows
 * whenever the row it names stops matching the WHERE between two page requests.
 * Reintroducing a `{ cursor, take }` port type would invite that bug back.
 */

/**
 * Generic, framework-agnostic paginated result envelope.
 * `nextCursor` is `null` when there are no more pages.
 */
export interface CursorPaginatedResult<T> {
  data: T[];
  meta: CursorPaginationMeta;
}

export interface CursorPaginationMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * Upper bound for a page token on the query string. Every issued token is well under
 * 200 chars; the cap exists so an attacker cannot make the server base64-decode and
 * JSON.parse a multi-KB blob per request. Same defensive intent as sanitizeLimit.
 */
export const MAX_CURSOR_LENGTH = 512;

/**
 * Sanitizes raw `limit` from the query string.
 * Centralized so every controller applies the same clamping
 * (defends against `?limit=999999` resource-exhaustion attempts).
 */
export function sanitizeLimit(rawLimit?: number): number {
  if (rawLimit === undefined || Number.isNaN(rawLimit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit)));
}

export function buildCursorMeta(
  limit: number,
  hasMore: boolean,
  lastItemId: string | undefined,
): CursorPaginationMeta {
  return {
    limit,
    nextCursor: hasMore && lastItemId !== undefined ? lastItemId : null,
    hasMore,
  };
}

/**
 * Turns an over-fetched row set into the paginated envelope. Callers fetch one
 * extra row (`take: limit + 1`); its presence means another page exists, so we
 * trim the probe row, derive hasMore and build the cursor meta from the last
 * kept id. T only needs an `id` for the cursor.
 *
 * `encodeCursor` lets a caller emit an opaque token instead of the bare id (e.g.
 * one carrying the active sort); omitted, the cursor stays the raw id.
 */
export function buildCursorPage<T extends { id: string }>(
  items: T[],
  limit: number,
  encodeCursor: (item: T) => string = (item) => item.id,
): CursorPaginatedResult<T> {
  const hasMore = items.length > limit;
  const trimmed = hasMore ? items.slice(0, limit) : items;
  const lastItem = trimmed[trimmed.length - 1];
  return {
    data: trimmed,
    meta: buildCursorMeta(
      limit,
      hasMore,
      lastItem === undefined ? undefined : encodeCursor(lastItem),
    ),
  };
}
