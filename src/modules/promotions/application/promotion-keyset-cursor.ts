import { createTimestampKeysetCodec } from '@shared/pagination/keyset-cursor';
import { InvalidPromotionCursorError } from './errors/invalid-promotion-cursor.error';

/**
 * Page tokens for both promotion listings - the public active one and the back-office
 * one - each paging on (createdAt desc, id desc). Shape, validation and the base64url
 * envelope come from the shared keyset codec.
 *
 * The public listing is where the row-drop was first measured: its WHERE is time-varying
 * (active AND now inside the window), so the cursor row can expire or be deactivated
 * between two requests. A 5-row unit paged 3 then 2 and silently lost a row under
 * Prisma's positional cursor.
 */
const codec = createTimestampKeysetCodec(InvalidPromotionCursorError);

export const encodePromotionCursor = codec.encode;
export const decodePromotionCursor = codec.decode;
