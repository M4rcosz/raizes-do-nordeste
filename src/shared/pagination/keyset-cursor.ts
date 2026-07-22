/**
 * Shared machinery for keyset page tokens.
 *
 * Why keyset and not Prisma's row cursor: `cursor` + `skip: 1` resolves a POSITION
 * inside the filtered set. If the row the cursor names stops matching the WHERE between
 * two requests - a product is deactivated, an order changes status, a promotion expires
 * - the position shifts and `skip: 1` swallows the following row instead. Measured on
 * the promotions listing: a 5-row unit paged 3 then 2 and silently lost a row. A keyset
 * compares VALUES, so the row it names need not still match, or even still exist.
 *
 * Two layers here on purpose. Most listings page on a timestamp column and share the
 * whole codec; orders carries a selectable sort field, so it reuses only the envelope
 * and brings its own payload shape and guard.
 *
 * A token is a position, never an authorization input. Nothing in here is signed, so
 * every listing applies its own ownership/unit filter independently of what a token
 * claims.
 */

/** An ApplicationError subclass. Each context passes its own so the message stays local. */
export type CursorErrorFactory = new (message: string, options?: { cause?: unknown }) => Error;

/** base64url of the JSON payload. Obfuscation only, not a signature - never trust the contents. */
export function encodeCursorPayload(payload: object): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Decodes and validates in one step. The guard is mandatory: a token is attacker-supplied,
 * so the parsed value is `unknown` until a caller-owned predicate narrows it.
 */
export function decodeCursorPayload<T>(
  token: string,
  isValidPayload: (value: unknown) => value is T,
  InvalidCursorError: CursorErrorFactory,
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch (err) {
    throw new InvalidCursorError('Invalid pagination cursor.', { cause: err });
  }

  if (!isValidPayload(parsed)) {
    throw new InvalidCursorError('Invalid pagination cursor.');
  }

  return parsed;
}

/**
 * The (timestamp, id) sort key of the last row on the previous page. WHICH column the
 * timestamp is (createdAt, updatedAt) is the repository's business, not the token's.
 */
export interface TimestampKeysetCursor {
  /** ISO-8601 instant. */
  timestamp: string;
  id: string;
}

/**
 * Widest span a persisted row timestamp can plausibly hold, and comfortably inside what
 * Postgres `timestamp` accepts. `Date.parse` alone is not enough: '-271821-04-20' is a
 * perfectly valid JS Date that Postgres rejects outright, which turns an attacker-chosen
 * token into a driver-level 500 on a public route rather than a 422.
 */
const MIN_KEYSET_INSTANT = Date.UTC(1900, 0, 1);
const MAX_KEYSET_INSTANT = Date.UTC(2200, 0, 1);

/** Row ids are uuids everywhere; this only has to exclude what a text column cannot hold. */
const MAX_KEYSET_ID_LENGTH = 128;

export function isTimestampKeysetCursor(value: unknown): value is TimestampKeysetCursor {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate: Record<string, unknown> = { ...value };
  if (typeof candidate.id !== 'string' || !isSafeKeysetId(candidate.id)) {
    return false;
  }
  if (typeof candidate.timestamp !== 'string') {
    return false;
  }
  return isSafeKeysetInstant(candidate.timestamp);
}

/**
 * Must be a real instant the database can also hold. A NaN date compares false against
 * everything, so the keyset would match nothing and the caller would read a silent empty
 * page as "end of results"; an in-range-for-JS but out-of-range-for-Postgres date turns
 * into a driver error, i.e. a 500 on a public route instead of a 422.
 */
export function isSafeKeysetInstant(value: string): boolean {
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && parsed >= MIN_KEYSET_INSTANT && parsed <= MAX_KEYSET_INSTANT;
}

/**
 * A NUL byte passes a `typeof === 'string'` check but Postgres `text` cannot store or
 * compare one, so it surfaces as a driver error the use case wraps into a 500. Rejecting
 * control characters here keeps every malformed token on the 422 path.
 */
export function isSafeKeysetId(id: string): boolean {
  if (id.length === 0 || id.length > MAX_KEYSET_ID_LENGTH) {
    return false;
  }
  // Char codes rather than a regex: a control-character class trips no-control-regex,
  // and suppressing that rule to write the very check it exists to catch reads worse
  // than just doing the comparison.
  for (let i = 0; i < id.length; i++) {
    const code = id.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return false;
    }
  }
  return true;
}

/** The decoded position as the repository wants it - a real Date, not the wire string. */
export interface TimestampKeyset {
  timestamp: Date;
  id: string;
}

/**
 * Function properties, not method signatures: each context re-exports these standalone
 * (`export const encodeX = codec.encode`), and a method signature would make that an
 * unbound-method extraction. Neither closure touches `this`.
 */
export interface TimestampKeysetCodec {
  encode: (timestamp: Date, id: string) => string;
  decode: (token: string) => TimestampKeyset;
}

/**
 * Builds a context's codec. Bound to that context's cursor error so an undecodable token
 * still surfaces as the error the context's callers already handle.
 */
export function createTimestampKeysetCodec(
  InvalidCursorError: CursorErrorFactory,
): TimestampKeysetCodec {
  return {
    encode: (timestamp: Date, id: string) =>
      encodeCursorPayload({ timestamp: timestamp.toISOString(), id }),
    decode: (token: string): TimestampKeyset => {
      const { timestamp, id } = decodeCursorPayload(
        token,
        isTimestampKeysetCursor,
        InvalidCursorError,
      );
      return { timestamp: new Date(timestamp), id };
    },
  };
}
