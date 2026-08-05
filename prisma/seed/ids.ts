import { createHash } from 'node:crypto';

// Every seeded row gets its id derived from a stable slug instead of a random uuid.
// Re-running the seed then upserts the same rows rather than inserting a second copy,
// and an id stays quotable in docs/Postman across a full db:down + db:seed cycle.
// Deliberately keeps the pre-rename name: this string is a hash salt, not a brand.
// Changing it regenerates every seed id, which would strand every id quoted in the
// docs and Postman collection and make db:seed insert a second copy of every row
// instead of upserting. Only ever change it together with a bumped .vN suffix and a
// full reseed.
const NAMESPACE = 'raizes-do-nordeste.seed.v2';

/** Deterministic UUIDv5-shaped id for a seed slug (e.g. "order:app-ana-delivered"). */
export function seedId(slug: string): string {
  const digest = createHash('sha1').update(`${NAMESPACE}:${slug}`).digest();

  // Stamp the version (5) and the RFC 4122 variant so the value is a well-formed uuid,
  // which matters for any column or client that parses it as one.
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;

  const hex = digest.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
