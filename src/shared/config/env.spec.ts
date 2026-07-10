import { describe, expect, it } from '@jest/globals';
import {
  parseCookieSecure,
  parseCorsOrigins,
  parseDurationMsEnv,
  parseDurationStringEnv,
  parseIntEnv,
  parseSameSite,
  parseTrustProxy,
} from './env';

describe('parseDurationMsEnv', () => {
  it('returns the default when the var is absent or empty', () => {
    expect(parseDurationMsEnv('TTL', undefined, 1000)).toBe(1000);
    expect(parseDurationMsEnv('TTL', '', 1000)).toBe(1000);
  });

  it('parses seconds, minutes, hours and days', () => {
    expect(parseDurationMsEnv('TTL', '30s', 0)).toBe(30_000);
    expect(parseDurationMsEnv('TTL', '15m', 0)).toBe(900_000);
    expect(parseDurationMsEnv('TTL', '2h', 0)).toBe(7_200_000);
    expect(parseDurationMsEnv('TTL', '7d', 0)).toBe(604_800_000);
    expect(parseDurationMsEnv('TTL', '500ms', 0)).toBe(500);
  });

  it('throws on a malformed duration, naming the var and value', () => {
    expect(() => parseDurationMsEnv('TTL', 'abc', 0)).toThrow(/TTL.*abc/);
    expect(() => parseDurationMsEnv('TTL', '10', 0)).toThrow(/TTL/);
    expect(() => parseDurationMsEnv('TTL', '10w', 0)).toThrow(/TTL/);
  });
});

// Backs JWT_ACCESS_TTL. jwt takes the literal string, so this validates rather
// than converts: the fallback branch used to live inline in identity.module.ts,
// where no unit test could reach it.
describe('parseDurationStringEnv', () => {
  it('returns the default when the var is absent or empty', () => {
    expect(parseDurationStringEnv('TTL', undefined, '15m')).toBe('15m');
    expect(parseDurationStringEnv('TTL', '', '15m')).toBe('15m');
  });

  it('returns a valid duration verbatim', () => {
    expect(parseDurationStringEnv('TTL', '30s', '15m')).toBe('30s');
    expect(parseDurationStringEnv('TTL', '7d', '15m')).toBe('7d');
    expect(parseDurationStringEnv('TTL', '500ms', '15m')).toBe('500ms');
  });

  it('trims surrounding whitespace', () => {
    expect(parseDurationStringEnv('TTL', '  15m  ', '1h')).toBe('15m');
  });

  // Without this the boot succeeds and jwt.sign throws on the first login instead.
  it('throws on a malformed duration, naming the var and value', () => {
    expect(() => parseDurationStringEnv('TTL', 'abc', '15m')).toThrow(/TTL.*abc/);
    expect(() => parseDurationStringEnv('TTL', '10', '15m')).toThrow(/TTL/);
    expect(() => parseDurationStringEnv('TTL', '10w', '15m')).toThrow(/TTL/);
  });
});

describe('parseIntEnv', () => {
  it('returns the default when the var is absent', () => {
    expect(parseIntEnv('X', undefined, 100)).toBe(100);
  });

  it('treats empty string as absent and returns the default', () => {
    expect(parseIntEnv('X', '', 100)).toBe(100);
  });

  it('parses a valid integer', () => {
    expect(parseIntEnv('X', '50', 100)).toBe(50);
  });

  it('throws on a non integer value', () => {
    expect(() => parseIntEnv('X', 'abc', 100)).toThrow(/X/);
  });

  it('throws on a non integer numeric value', () => {
    expect(() => parseIntEnv('X', '1.5', 100)).toThrow(/X/);
  });

  it('throws when below min', () => {
    expect(() => parseIntEnv('THROTTLE_LIMIT', '0', 100, { min: 1 })).toThrow(/THROTTLE_LIMIT/);
  });

  it('accepts a value at the min boundary', () => {
    expect(parseIntEnv('THROTTLE_LIMIT', '1', 100, { min: 1 })).toBe(1);
  });
});

describe('parseCorsOrigins', () => {
  it('reflects any origin when absent or empty', () => {
    expect(parseCorsOrigins(undefined)).toBe(true);
    expect(parseCorsOrigins('')).toBe(true);
  });

  it('returns a single-element allowlist', () => {
    expect(parseCorsOrigins('https://app.vercel.app')).toEqual(['https://app.vercel.app']);
  });

  it('splits a comma-separated allowlist and trims entries', () => {
    expect(parseCorsOrigins('https://a.com, https://b.com ,https://c.com')).toEqual([
      'https://a.com',
      'https://b.com',
      'https://c.com',
    ]);
  });

  it('drops blank entries between commas', () => {
    expect(parseCorsOrigins('https://a.com,,https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('throws when present but resolving to no origins', () => {
    expect(() => parseCorsOrigins(',,')).toThrow(/CORS_ORIGINS/);
    expect(() => parseCorsOrigins('  ')).toThrow(/CORS_ORIGINS/);
  });
});

describe('parseTrustProxy', () => {
  it('returns false when absent', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(parseTrustProxy('')).toBe(false);
  });

  it('returns true for "true"', () => {
    expect(parseTrustProxy('true')).toBe(true);
  });

  it('returns false for "false"', () => {
    expect(parseTrustProxy('false')).toBe(false);
  });

  it('returns the hop count for an integer', () => {
    expect(parseTrustProxy('2')).toBe(2);
  });

  it('throws on an unrecognized value', () => {
    expect(() => parseTrustProxy('foo')).toThrow(/TRUST_PROXY/);
  });

  it('throws on a negative hop count', () => {
    expect(() => parseTrustProxy('-1')).toThrow(/TRUST_PROXY/);
  });
});

describe('parseCookieSecure', () => {
  it('defaults to true when absent or empty', () => {
    expect(parseCookieSecure(undefined)).toBe(true);
    expect(parseCookieSecure('')).toBe(true);
  });

  it('returns true for "true"', () => {
    expect(parseCookieSecure('true')).toBe(true);
  });

  it('returns false for "false"', () => {
    expect(parseCookieSecure('false')).toBe(false);
  });

  it('throws on an unrecognized value, naming the var and value', () => {
    expect(() => parseCookieSecure('yes')).toThrow(/COOKIE_SECURE.*yes/);
  });
});

describe('parseSameSite', () => {
  it('defaults to "strict" when absent or empty', () => {
    expect(parseSameSite(undefined)).toBe('strict');
    expect(parseSameSite('')).toBe('strict');
  });

  it('accepts "strict", "lax" and "none"', () => {
    expect(parseSameSite('strict')).toBe('strict');
    expect(parseSameSite('lax')).toBe('lax');
    expect(parseSameSite('none')).toBe('none');
  });

  it('throws on an unrecognized value, naming the var and value', () => {
    expect(() => parseSameSite('Strict')).toThrow(/COOKIE_SAMESITE.*Strict/);
  });
});
