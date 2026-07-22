import { createTimestampKeysetCodec } from '@shared/pagination/keyset-cursor';
import { InvalidAuditLogCursorError } from './errors/invalid-audit-log-cursor.error';

/**
 * Page tokens for the audit log listing, paging on (createdAt desc, id desc).
 *
 * Audit rows are append-only and immutable, so this is the one listing a positional
 * cursor was genuinely safe on. Migrated for uniformity, and because the safety rests
 * on "nothing ever deletes an audit row" - true today, not enforced anywhere.
 */
const codec = createTimestampKeysetCodec(InvalidAuditLogCursorError);

export const encodeAuditLogCursor = codec.encode;
export const decodeAuditLogCursor = codec.decode;
