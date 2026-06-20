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
