import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { Response } from 'express';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  clearRefreshCookie,
  resolveRefreshCookieOptions,
  setRefreshCookie,
} from './refresh-cookie';

function mockRes(): Response {
  return { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;
}

describe('refresh-cookie', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  describe('setRefreshCookie', () => {
    it('forwards the configured attributes and the ttl as maxAge', () => {
      const res = mockRes();

      setRefreshCookie(res, 'tok', 1000, { secure: false, sameSite: 'lax' });

      expect(res.cookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, 'tok', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: REFRESH_COOKIE_PATH,
        maxAge: 1000,
      });
    });
  });

  describe('clearRefreshCookie', () => {
    it('clears with the same attributes so the browser drops the cookie', () => {
      const res = mockRes();

      clearRefreshCookie(res, { secure: true, sameSite: 'strict' });

      expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: REFRESH_COOKIE_PATH,
      });
    });
  });

  describe('resolveRefreshCookieOptions', () => {
    it('defaults to secure + strict when the env is unset', () => {
      delete process.env.COOKIE_SECURE;
      delete process.env.COOKIE_SAMESITE;

      expect(resolveRefreshCookieOptions()).toEqual({ secure: true, sameSite: 'strict' });
    });

    it('reads valid values from the env', () => {
      process.env.COOKIE_SECURE = 'false';
      process.env.COOKIE_SAMESITE = 'lax';

      expect(resolveRefreshCookieOptions()).toEqual({ secure: false, sameSite: 'lax' });
    });

    it('rejects SameSite=None without Secure (browsers drop such a cookie)', () => {
      process.env.COOKIE_SECURE = 'false';
      process.env.COOKIE_SAMESITE = 'none';

      expect(() => resolveRefreshCookieOptions()).toThrow(/COOKIE_SAMESITE=none/);
    });
  });
});
