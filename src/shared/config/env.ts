// Boot-time env parsing. These run while the process is starting, before the
// Nest exception filter exists, so they throw plain Error and let the boot
// crash. The point is fail-fast: an absent var falls back to its default, but a
// present-but-invalid var must stop the boot instead of silently degrading.

// Parse an integer env var. Treats undefined and '' as absent (returns the
// default). A present value that is not a valid integer, or that violates the
// optional min, throws and names both the var and the received value.
export function parseIntEnv(
  name: string,
  raw: string | undefined,
  defaultValue: number,
  opts: { min?: number } = {},
): number {
  // Number('') is 0, so empty string must be treated as absent before parsing.
  if (raw === undefined || raw === '') {
    return defaultValue;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid env ${name}: expected an integer, received "${raw}"`);
  }

  if (opts.min !== undefined && parsed < opts.min) {
    throw new Error(`Invalid env ${name}: expected an integer >= ${opts.min}, received "${raw}"`);
  }

  return parsed;
}

// Parse a short duration string like "15m", "7d", "30s" into milliseconds.
// Accepts a bare integer count plus a unit suffix (ms, s, m, h, d). Treats
// undefined and '' as absent (returns the default). A present-but-malformed
// value throws and names both the var and what it received.
const DURATION_UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d)$/;

export function parseDurationMsEnv(
  name: string,
  raw: string | undefined,
  defaultMs: number,
): number {
  if (raw === undefined || raw === '') {
    return defaultMs;
  }

  const match = DURATION_PATTERN.exec(raw.trim());
  if (!match) {
    throw new Error(
      `Invalid env ${name}: expected a duration like "15m" or "7d", received "${raw}"`,
    );
  }

  const [, count, unit] = match;
  return Number(count) * DURATION_UNIT_MS[unit];
}

// Same duration grammar, but returns the string itself for consumers that want a
// duration literal rather than milliseconds (jwt's `expiresIn`). Validating here
// means a malformed JWT_ACCESS_TTL stops the boot instead of throwing on the first
// token sign, and an empty string falls back to the default rather than reaching
// jwt as ''.
export function parseDurationStringEnv(
  name: string,
  raw: string | undefined,
  defaultValue: string,
): string {
  if (raw === undefined || raw === '') {
    return defaultValue;
  }

  const trimmed = raw.trim();
  if (!DURATION_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid env ${name}: expected a duration like "15m" or "7d", received "${raw}"`,
    );
  }

  return trimmed;
}

// Parse CORS_ORIGINS into what the express cors option understands. Absent or
// empty means no allowlist is configured, so we reflect any origin
// (origin: true) and preserve the permissive dev default. A present value is a
// comma-separated allowlist; entries are trimmed and blanks dropped. A value
// that is present but resolves to no origins (e.g. ",,") throws instead of
// silently reflecting all origins, since that signals a misconfiguration.
export function parseCorsOrigins(raw: string | undefined): boolean | string[] {
  if (raw === undefined || raw === '') {
    return true;
  }

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error(
      `Invalid env CORS_ORIGINS: expected a comma-separated list of origins, received "${raw}"`,
    );
  }

  return origins;
}

// Map TRUST_PROXY into what express understands: a boolean for the on/off cases
// or a hop count when a non negative integer is given. Absent means off. A
// present but unrecognized value throws instead of silently falling back to off.
export function parseTrustProxy(raw: string | undefined): boolean | number {
  if (raw === undefined || raw === '') {
    return false;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }

  const hops = Number(raw);
  if (Number.isInteger(hops) && hops >= 0) {
    return hops;
  }

  throw new Error(
    `Invalid env TRUST_PROXY: expected "true", "false" or an integer >= 0, received "${raw}"`,
  );
}

// Parse COOKIE_SECURE into the boolean for the cookie "secure" attribute.
// Absent means secure (production default: cookies only over https). Set to
// "false" for local http dev. A present but unrecognized value throws instead
// of silently defaulting.
export function parseCookieSecure(raw: string | undefined): boolean {
  if (raw === undefined || raw === '') {
    return true;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }

  throw new Error(`Invalid env COOKIE_SECURE: expected "true" or "false", received "${raw}"`);
}

// Parse COOKIE_SAMESITE into the SameSite attribute the express res.cookie
// option understands. Absent means the safe default "strict". A present but
// unrecognized value throws instead of silently defaulting.
export function parseSameSite(raw: string | undefined): 'strict' | 'lax' | 'none' {
  if (raw === undefined || raw === '') {
    return 'strict';
  }
  if (raw === 'strict' || raw === 'lax' || raw === 'none') {
    return raw;
  }

  throw new Error(
    `Invalid env COOKIE_SAMESITE: expected "strict", "lax" or "none", received "${raw}"`,
  );
}
