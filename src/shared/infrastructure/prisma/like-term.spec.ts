import { describe, expect, it } from '@jest/globals';
import { escapeLikeTerm } from './like-term';

describe('escapeLikeTerm', () => {
  it('leaves an ordinary term untouched', () => {
    expect(escapeLikeTerm('estoque centro')).toBe('estoque centro');
  });

  it('escapes the multi-character wildcard', () => {
    expect(escapeLikeTerm('100%')).toBe('100\\%');
  });

  it('escapes the single-character wildcard', () => {
    expect(escapeLikeTerm('a_b')).toBe('a\\_b');
  });

  // Escaped FIRST, or the backslashes added for % and _ would themselves be escaped
  // again and the pattern would look for a literal backslash before the wildcard.
  it('escapes a backslash without double-escaping what it adds', () => {
    expect(escapeLikeTerm('a\\b')).toBe('a\\\\b');
    expect(escapeLikeTerm('\\%')).toBe('\\\\\\%');
  });

  it('escapes every occurrence, not just the first', () => {
    expect(escapeLikeTerm('%a%b%')).toBe('\\%a\\%b\\%');
  });

  // The shape the DoS concern rests on: a term dense in wildcards becomes a term
  // dense in literals, which the LIKE matcher walks in linear time.
  it('neutralises a wildcard-dense term', () => {
    expect(escapeLikeTerm('%a'.repeat(26))).toBe('\\%a'.repeat(26));
  });

  it('is a no-op on an empty term', () => {
    expect(escapeLikeTerm('')).toBe('');
  });
});
