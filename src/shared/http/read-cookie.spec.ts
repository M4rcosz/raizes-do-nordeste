import { describe, expect, it } from '@jest/globals';
import { readCookie } from './read-cookie';

describe('readCookie', () => {
  it('returns undefined when the header is absent', () => {
    expect(readCookie(undefined, 'refresh_token')).toBeUndefined();
  });

  it('returns undefined when the header is empty', () => {
    expect(readCookie('', 'refresh_token')).toBeUndefined();
  });

  it('returns undefined when the named cookie is not present', () => {
    expect(readCookie('session=abc; theme=dark', 'refresh_token')).toBeUndefined();
  });

  it('reads a single cookie', () => {
    expect(readCookie('refresh_token=abc', 'refresh_token')).toBe('abc');
  });

  it('reads the cookie from a list of several', () => {
    expect(readCookie('session=xyz; refresh_token=abc; theme=dark', 'refresh_token')).toBe('abc');
  });

  it('preserves an internal "=" in the value', () => {
    expect(readCookie('refresh_token=a=b=c', 'refresh_token')).toBe('a=b=c');
  });

  it('trims surrounding spaces around name and value', () => {
    expect(readCookie('  refresh_token =  abc  ; other=1', 'refresh_token')).toBe('abc');
  });

  it('url-decodes the value', () => {
    expect(readCookie('refresh_token=a%20b', 'refresh_token')).toBe('a b');
  });

  it('treats an empty cookie value as absent so the caller can fall back', () => {
    expect(readCookie('refresh_token=', 'refresh_token')).toBeUndefined();
    expect(readCookie('refresh_token=  ; other=1', 'refresh_token')).toBeUndefined();
  });

  it('treats a malformed percent-escape as absent instead of throwing', () => {
    expect(readCookie('refresh_token=%zz', 'refresh_token')).toBeUndefined();
  });
});
