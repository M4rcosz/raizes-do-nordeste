import { describe, expect, it } from '@jest/globals';
import { RefreshToken } from './refresh-token.entity';

describe('RefreshToken', () => {
  const HOUR_MS = 60 * 60 * 1000;

  describe('issue', () => {
    it('mints an active token with a uuid id, future expiry, and no revocation', () => {
      const before = Date.now();
      const token = RefreshToken.issue({ userId: 'user-1', tokenHash: 'hash-1', ttlMs: HOUR_MS });

      expect(token.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(token.userId).toBe('user-1');
      expect(token.tokenHash).toBe('hash-1');
      expect(token.revokedAt).toBeNull();
      expect(token.replacedById).toBeNull();
      expect(token.expiresAt.getTime()).toBeGreaterThanOrEqual(before + HOUR_MS);
      expect(token.isRevoked()).toBe(false);
      expect(token.isExpired()).toBe(false);
      expect(token.canRotate()).toBe(true);
    });

    it('derives expiresAt as createdAt plus ttl', () => {
      const token = RefreshToken.issue({ userId: 'u', tokenHash: 'h', ttlMs: HOUR_MS });
      expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(HOUR_MS);
    });
  });

  describe('isExpired', () => {
    it('is false before expiry and true at/after it', () => {
      const token = RefreshToken.fromPersistence({
        id: 't1',
        userId: 'u1',
        tokenHash: 'h1',
        expiresAt: new Date('2026-01-01T12:00:00Z'),
        revokedAt: null,
        replacedById: null,
        createdAt: new Date('2026-01-01T11:00:00Z'),
      });

      expect(token.isExpired(new Date('2026-01-01T11:59:59Z'))).toBe(false);
      expect(token.isExpired(new Date('2026-01-01T12:00:00Z'))).toBe(true);
      expect(token.isExpired(new Date('2026-01-01T12:00:01Z'))).toBe(true);
    });
  });

  describe('isRevoked / canRotate', () => {
    const base = {
      id: 't1',
      userId: 'u1',
      tokenHash: 'h1',
      expiresAt: new Date(Date.now() + HOUR_MS),
      replacedById: null,
      createdAt: new Date(),
    };

    it('a revoked token cannot rotate', () => {
      const token = RefreshToken.fromPersistence({ ...base, revokedAt: new Date() });
      expect(token.isRevoked()).toBe(true);
      expect(token.canRotate()).toBe(false);
    });

    it('an expired token cannot rotate even if not revoked', () => {
      const token = RefreshToken.fromPersistence({
        ...base,
        revokedAt: null,
        expiresAt: new Date(Date.now() - HOUR_MS),
      });
      expect(token.isRevoked()).toBe(false);
      expect(token.canRotate()).toBe(false);
    });

    it('an active, unexpired token can rotate', () => {
      const token = RefreshToken.fromPersistence({ ...base, revokedAt: null });
      expect(token.canRotate()).toBe(true);
    });
  });
});
