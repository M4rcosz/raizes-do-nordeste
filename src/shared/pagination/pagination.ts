/**
 * Repository-level cursor pagination input.
 * `take` is the page size; `cursor` (when provided) marks the last item
 * of the previous page - results begin AFTER it.
 */
export interface CursorPaginationParams {
  cursor?: string;
  take: number;
}

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
