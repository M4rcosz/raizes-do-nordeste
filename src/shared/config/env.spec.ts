import { describe, expect, it } from '@jest/globals';
import { parseIntEnv, parseTrustProxy } from './env';

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
