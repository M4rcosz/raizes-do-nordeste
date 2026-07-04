// Read a single cookie value out of a raw Cookie request header. Pure and
// stateless so it can be unit-tested in isolation and reused without pulling in
// a cookie-parser dependency. Returns undefined when the header is absent or
// the named cookie is not present.
export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (cookieHeader === undefined || cookieHeader === '') {
    return undefined;
  }

  for (const pair of cookieHeader.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) {
      continue;
    }

    const key = pair.slice(0, eq).trim();
    if (key !== name) {
      continue;
    }

    const value = pair.slice(eq + 1).trim();
    // An empty cookie (refresh_token=) counts as absent so the caller can still
    // fall back to the body instead of failing on a blank value.
    if (value === '') {
      return undefined;
    }
    // The header is fully client-controlled, so a bad percent-escape must not
    // blow up into a 500. Treat a malformed value as an absent cookie.
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
}
