import { describe, expect, it } from '@jest/globals';
import { normalizeEmail } from './email-normalization';

describe('normalizeEmail', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  ops@example.com  ')).toBe('ops@example.com');
  });

  it('lowercases so a case variant cannot become a second account', () => {
    expect(normalizeEmail('Maria@Example.COM')).toBe('maria@example.com');
  });

  it('trims and lowercases together', () => {
    expect(normalizeEmail(' OPS@Example.COM ')).toBe('ops@example.com');
  });

  it('leaves an already-canonical address unchanged', () => {
    expect(normalizeEmail('joao@example.com')).toBe('joao@example.com');
  });
});
