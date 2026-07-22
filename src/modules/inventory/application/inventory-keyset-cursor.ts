import { createTimestampKeysetCodec } from '@shared/pagination/keyset-cursor';
import { InvalidInventoryCursorError } from './errors/invalid-inventory-cursor.error';

/**
 * Page tokens for the unit inventory listing, paging on (createdAt asc, id asc).
 *
 * The WHERE here is only businessUnitId, which never changes, so this listing was not
 * losing rows. It is a keyset anyway for one reason and one uniformity argument: a
 * positional cursor still breaks outright if the row it names is deleted, and having
 * every listing in the codebase page the same way removes the question of which one
 * behaves how.
 */
const codec = createTimestampKeysetCodec(InvalidInventoryCursorError);

export const encodeInventoryCursor = codec.encode;
export const decodeInventoryCursor = codec.decode;
