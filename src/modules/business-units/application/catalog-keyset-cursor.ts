import { createTimestampKeysetCodec } from '@shared/pagination/keyset-cursor';
import { InvalidCatalogCursorError } from './errors/invalid-catalog-cursor.error';

/**
 * Page tokens for every catalog listing: products, categories, business units and menu
 * items. One codec for the whole context, the same way ai shares one across its two
 * listings - each of these pages on (createdAt desc, id desc), and which table that
 * createdAt belongs to is the repository's business.
 *
 * These listings are the ones a positional cursor hurts most: their WHERE is a set of
 * toggleable flags (isActive, isAvailable). Deactivate the product the cursor names
 * between two page requests and Prisma's `skip: 1` eats the next product instead - a
 * silently short menu, with no error anywhere.
 */
const codec = createTimestampKeysetCodec(InvalidCatalogCursorError);

export const encodeCatalogCursor = codec.encode;
export const decodeCatalogCursor = codec.decode;
