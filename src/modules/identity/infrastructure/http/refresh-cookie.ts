import type { Response } from 'express';
import { parseCookieSecure, parseSameSite } from '@shared/config/env';

// Identity's refresh-token cookie policy. Keeps the cookie name, path and the
// security attributes in one place so setting and clearing stay in sync (a
// browser only drops a cookie when name/path/sameSite/secure match).
export const REFRESH_COOKIE_NAME = 'refresh_token';
// Scope the cookie to the auth routes so it does not ride along on every
// request, only login/refresh/logout. Note: this bakes in the global 'api'
// prefix from main.ts; if that prefix changes, this must change with it.
export const REFRESH_COOKIE_PATH = '/api/auth';

// The env-derived attributes, resolved once at boot (see resolveRefreshCookieOptions)
// and injected, so an invalid value crashes the boot instead of surfacing as a
// 500 on the first cookie request.
export interface RefreshCookieOptions {
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
}

export const REFRESH_COOKIE_OPTIONS = Symbol('RefreshCookieOptions');

// Read and validate the cookie attributes from the environment. Runs at boot
// (module factory) to keep the fail-fast contract of the other env parsers.
export function resolveRefreshCookieOptions(): RefreshCookieOptions {
  const secure = parseCookieSecure(process.env.COOKIE_SECURE);
  const sameSite = parseSameSite(process.env.COOKIE_SAMESITE);

  // Browsers silently drop a SameSite=None cookie that is not Secure. Reject the
  // combination at boot rather than shipping a cookie the browser discards.
  if (sameSite === 'none' && !secure) {
    throw new Error(
      'Invalid cookie config: COOKIE_SAMESITE=none requires COOKIE_SECURE=true ' +
        '(browsers drop insecure SameSite=None cookies).',
    );
  }

  return { secure, sameSite };
}

export function setRefreshCookie(
  res: Response,
  token: string,
  ttlMs: number,
  options: RefreshCookieOptions,
): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: options.secure,
    sameSite: options.sameSite,
    path: REFRESH_COOKIE_PATH,
    maxAge: ttlMs,
  });
}

export function clearRefreshCookie(res: Response, options: RefreshCookieOptions): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: options.secure,
    sameSite: options.sameSite,
    path: REFRESH_COOKIE_PATH,
  });
}
