import { createTimestampKeysetCodec } from '@shared/pagination/keyset-cursor';
import { InvalidUserCursorError } from './errors/invalid-user-cursor.error';

/**
 * Page tokens for the user listing, pageing on (createdAt desc, id desc). Shape,
 * validation and the base64url envelope come from the shared keyset codec.
 *
 * Not a positional cursor: role and unit membership are both editable
 * (PUT /users/:id/business-units), so the row a cursor names can leave a
 * role- or unit-filtered listing between two page requests. Prisma's `skip: 1`
 * would then drop the next user from an admin's view with no error anywhere.
 *
 * The token stays a position, never an authorization input: the MANAGER unit scope
 * is forced from the claim in the use case, whatever a forged token names.
 */
const codec = createTimestampKeysetCodec(InvalidUserCursorError);

export const encodeUserCursor = codec.encode;
export const decodeUserCursor = codec.decode;
