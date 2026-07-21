import { InvalidAiCursorError } from './errors/invalid-ai-cursor.error';

/**
 * A page position for the ai listings: the sort key of the row the page stopped at.
 * Both terms of the ordering travel in the token because these listings are paginated
 * by an explicit keyset predicate, not by Prisma's row cursor.
 *
 * Why not the row cursor: Prisma's cursor resolves a POSITION inside the filtered set,
 * so if the cursor row stops matching between two requests the position shifts and
 * `skip: 1` eats a different row. The conversation listing is the worst case for that:
 * its sort column is updatedAt, which moves on every appended turn, so the row the
 * cursor names routinely leaves the position it had. A keyset predicate compares
 * values instead of positions, so the cursor row need not exist, let alone still match.
 *
 * One shape serves both listings: each pages on (timestamp desc, id desc). WHICH column
 * the timestamp is (conversations: updatedAt, memberships: createdAt) is the
 * repository's business, not the token's.
 *
 * Carries no authorization data. The token is a position, never an authorization input:
 * the owner filter is applied independently, whatever a forged token names.
 */
export interface AiKeysetCursor {
  /** ISO-8601 sort timestamp of the last row on the previous page. */
  timestamp: string;
  id: string;
}

/** base64url of the JSON payload. Obfuscation only, not a signature - never trust the contents. */
export function encodeAiKeysetCursor(timestamp: Date, id: string): string {
  const payload: AiKeysetCursor = { timestamp: timestamp.toISOString(), id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeAiKeysetCursor(token: string): AiKeysetCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch (err) {
    throw new InvalidAiCursorError('Invalid pagination cursor.', { cause: err });
  }

  if (!isAiKeysetCursor(parsed)) {
    throw new InvalidAiCursorError('Invalid pagination cursor.');
  }

  return parsed;
}

function isAiKeysetCursor(value: unknown): value is AiKeysetCursor {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate: Record<string, unknown> = { ...value };
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.timestamp === 'string' &&
    // Must be a real instant: a NaN date would silently match nothing in the keyset.
    !Number.isNaN(Date.parse(candidate.timestamp))
  );
}
