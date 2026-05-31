import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { User } from './user.entity';
import { PasswordHasher } from '../ports/password-hasher.port';

describe('User', () => {
  const buildUser = (overrides?: { passwordHash?: string }): User =>
    new User(
      'uuid-1',
      'bu-1',
      'panic',
      'Pedro Panic',
      'panic@example.com',
      overrides?.passwordHash ?? 'real-hash',
      '34999999999',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
      null,
      'KITCHEN',
      true,
    );

  describe('constructor', () => {
    it('should preserve all immutable fields', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');
      const user = new User(
        'uuid-1',
        'bu-1',
        'panic',
        'Pedro Panic',
        'panic@example.com',
        'real-hash',
        '34999999999',
        createdAt,
        updatedAt,
        null,
        'KITCHEN',
        true,
      );

      expect(user.id).toBe('uuid-1');
      expect(user.businessUnitId).toBe('bu-1');
      expect(user.username).toBe('panic');
      expect(user.name).toBe('Pedro Panic');
      expect(user.email).toBe('panic@example.com');
      expect(user.phone).toBe('34999999999');
      expect(user.createdAt).toBe(createdAt);
      expect(user.updatedAt).toBe(updatedAt);
      expect(user.updatedBy).toBeNull();
      expect(user.role).toBe('KITCHEN');
      expect(user.isActive).toBe(true);
    });
  });

  describe('verifyPasswordOrDecoy', () => {
    let verify: jest.MockedFunction<PasswordHasher['verify']>;
    let hasher: PasswordHasher;

    beforeEach(() => {
      verify = jest.fn() as jest.MockedFunction<PasswordHasher['verify']>;
      hasher = { hash: jest.fn() as jest.MockedFunction<PasswordHasher['hash']>, verify };
    });

    it("should call hasher with the user's password hash when user exists", async () => {
      verify.mockResolvedValue(true);
      const user = buildUser({ passwordHash: 'real-hash' });

      const result = await User.verifyPasswordOrDecoy(user, 'plain', hasher);

      expect(result).toBe(true);
      expect(verify).toHaveBeenCalledWith('real-hash', 'plain');
    });

    it('should still call hasher with null when user is null (timing-safe decoy)', async () => {
      verify.mockResolvedValue(false);

      const result = await User.verifyPasswordOrDecoy(null, 'plain', hasher);

      expect(result).toBe(false);
      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith(null, 'plain');
    });

    it("should return false when hasher rejects the user's password", async () => {
      verify.mockResolvedValue(false);
      const user = buildUser();

      const result = await User.verifyPasswordOrDecoy(user, 'wrong', hasher);

      expect(result).toBe(false);
    });
  });
});
