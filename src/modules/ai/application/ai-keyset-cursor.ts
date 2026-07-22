import { createTimestampKeysetCodec } from '@shared/pagination/keyset-cursor';
import { InvalidAiCursorError } from './errors/invalid-ai-cursor.error';

/**
 * Page tokens for the ai listings. Shape, validation and the base64url envelope all come
 * from the shared keyset codec (see `@shared/pagination/keyset-cursor` for why these
 * listings cannot use Prisma's row cursor).
 *
 * One codec serves both listings: each pages on (timestamp desc, id desc). WHICH column
 * the timestamp is - conversations: updatedAt, memberships: createdAt - is the
 * repository's business, not the token's. The conversation listing is the sharpest case
 * for a keyset anywhere in the codebase: updatedAt moves on every appended turn, so the
 * row a positional cursor names routinely leaves the position it had.
 *
 * What the keyset does NOT fix, and should not be over-trusted for: a DIFFERENT thread
 * further down the list being bumped above the cursor mid-pagination is skipped for the
 * rest of that pass. That is inherent to ordering on a mutable column, not something a
 * cursor of any shape can solve.
 */
const codec = createTimestampKeysetCodec(InvalidAiCursorError);

export const encodeAiKeysetCursor = codec.encode;
export const decodeAiKeysetCursor = codec.decode;
