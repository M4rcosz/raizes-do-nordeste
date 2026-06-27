import { createHash } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import { CryptoRefreshTokenGenerator } from './crypto-refresh-token-generator';

describe('CryptoRefreshTokenGenerator', () => {
  const generator = new CryptoRefreshTokenGenerator();

  describe('generate', () => {
    it('returns a token whose stored hash is the SHA-256 of the token', () => {
      const { token, tokenHash } = generator.generate();

      const expected = createHash('sha256').update(token).digest('hex');
      expect(tokenHash).toBe(expected);
    });

    it('never returns the plaintext as the hash', () => {
      const { token, tokenHash } = generator.generate();
      expect(tokenHash).not.toBe(token);
    });

    it('produces a distinct high-entropy value each call', () => {
      const values = new Set(Array.from({ length: 100 }, () => generator.generate().token));
      expect(values.size).toBe(100);
      // 32 bytes base64url is at least ~43 chars.
      expect([...values][0].length).toBeGreaterThanOrEqual(43);
    });
  });

  describe('hash', () => {
    it('is deterministic so a presented token maps to the stored hash', () => {
      const { token, tokenHash } = generator.generate();
      expect(generator.hash(token)).toBe(tokenHash);
    });
  });
});
