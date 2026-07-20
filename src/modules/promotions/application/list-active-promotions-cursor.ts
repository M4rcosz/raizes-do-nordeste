import { InvalidPromotionCursorError } from './errors/invalid-promotion-cursor.error';

/**
 * A page position for the public promotions listing: the sort key of the row the page
 * stopped at. Both terms of the ordering travel in the token because this listing is
 * paginated by an explicit keyset predicate, not by Prisma's row cursor.
 *
 * Why not the row cursor: this listing's WHERE is time-varying (active AND now inside
 * the window), so the cursor row can stop matching between two requests - it expires, or
 * an admin deactivates it. Prisma's cursor resolves a POSITION inside the filtered set,
 * so when the row drops out the position shifts and `skip: 1` eats a different row.
 * Measured: a 5-row unit paged 3 then 2 silently lost a row once the cursor was
 * deactivated mid-pagination. A keyset predicate compares values instead of positions,
 * so the cursor row need not exist, let alone still match.
 *
 * Carries no authorization data. The token is a position, never an authorization input:
 * the unit filter is applied independently, whatever a forged token names.
 */
export interface ActivePromotionCursor {
  /** ISO-8601 createdAt of the last row on the previous page. */
  createdAt: string;
  id: string;
}

/** base64url of the JSON payload. Obfuscation only, not a signature - never trust the contents. */
export function encodeActivePromotionCursor(createdAt: Date, id: string): string {
  const payload: ActivePromotionCursor = { createdAt: createdAt.toISOString(), id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeActivePromotionCursor(token: string): ActivePromotionCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch (err) {
    throw new InvalidPromotionCursorError('Invalid pagination cursor.', { cause: err });
  }

  if (!isActivePromotionCursor(parsed)) {
    throw new InvalidPromotionCursorError('Invalid pagination cursor.');
  }

  return parsed;
}

function isActivePromotionCursor(value: unknown): value is ActivePromotionCursor {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate: Record<string, unknown> = { ...value };
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.createdAt === 'string' &&
    // Must be a real instant: a NaN date would silently match nothing in the keyset.
    !Number.isNaN(Date.parse(candidate.createdAt))
  );
}
