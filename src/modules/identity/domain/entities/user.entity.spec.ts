import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { User } from './user.entity';
import { PasswordHasher } from '../ports/password-hasher.port';

describe('User', () => {
  const buildUser = (overrides?: { passwordHash?: string }): User =>
    new User(
      'uuid-1',
      ['bu-1'],
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
        ['bu-1'],
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
      expect(user.businessUnitIds).toEqual(['bu-1']);
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

  describe('register', () => {
    it('should build an active user with a generated uuid and timestamps', () => {
      const before = Date.now();
      const user = User.register({
        name: 'Maria Souza',
        username: 'maria.souza',
        passwordHash: 'hashed',
        role: 'CUSTOMER',
        email: 'maria@example.com',
        phone: '34988887777',
        businessUnitIds: ['bu-1'],
      });
      const after = Date.now();

      expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(user.isActive).toBe(true);
      expect(user.updatedBy).toBeNull();
      expect(user.role).toBe('CUSTOMER');
      expect(user.email).toBe('maria@example.com');
      expect(user.phone).toBe('34988887777');
      expect(user.businessUnitIds).toEqual(['bu-1']);
      expect(user.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(user.createdAt.getTime()).toBeLessThanOrEqual(after);
      expect(user.updatedAt.getTime()).toBe(user.createdAt.getTime());
    });

    it('should default optional fields to null', () => {
      const user = User.register({
        name: 'No Contact',
        username: 'no.contact',
        passwordHash: 'hashed',
        role: 'CUSTOMER',
      });

      expect(user.email).toBeNull();
      expect(user.phone).toBeNull();
      expect(user.businessUnitIds).toEqual([]);
    });

    it('should produce a distinct id per call', () => {
      const a = User.register({ name: 'A', username: 'a', passwordHash: 'h', role: 'CUSTOMER' });
      const b = User.register({ name: 'B', username: 'b', passwordHash: 'h', role: 'CUSTOMER' });

      expect(a.id).not.toBe(b.id);
    });

    it('should expose the hash only through toCreateInput, not a public field', () => {
      const user = User.register({
        name: 'Maria',
        username: 'maria',
        passwordHash: 'secret-hash',
        role: 'CUSTOMER',
      });

      expect(user.toCreateInput().passwordHash).toBe('secret-hash');
      // The hash is a private member: TypeScript blocks access through the public type.
      // @ts-expect-error passwordHash is not part of the public surface.
      const _typeGuard: unknown = user.passwordHash;
      expect(_typeGuard).toBeDefined();
    });
  });

  describe('canLogIn', () => {
    it('should be true for an active user', () => {
      expect(buildUser().canLogIn()).toBe(true);
    });

    it('should be false for an inactive user', () => {
      const inactive = new User(
        'uuid-1',
        ['bu-1'],
        'panic',
        'Pedro Panic',
        'panic@example.com',
        'real-hash',
        '34999999999',
        new Date(),
        new Date(),
        null,
        'KITCHEN',
        false,
      );

      expect(inactive.canLogIn()).toBe(false);
    });
  });

  describe('withProfile', () => {
    it('should return a new instance with name updated', () => {
      const user = buildUser();
      const updated = user.withProfile({ name: 'Novo Nome' });

      expect(updated.name).toBe('Novo Nome');
      expect(updated).not.toBe(user);
    });

    it('should return a new instance with phone updated', () => {
      const user = buildUser();
      const updated = user.withProfile({ phone: '34911112222' });

      expect(updated.phone).toBe('34911112222');
      expect(updated.name).toBe(user.name);
    });

    it('should update both name and phone at once', () => {
      const user = buildUser();
      const updated = user.withProfile({ name: 'Outro Nome', phone: '34933334444' });

      expect(updated.name).toBe('Outro Nome');
      expect(updated.phone).toBe('34933334444');
    });

    it('should not alter email, role, isActive, or other identity fields', () => {
      const user = buildUser();
      const updated = user.withProfile({ name: 'Caminho Novo' });

      expect(updated.id).toBe(user.id);
      expect(updated.username).toBe(user.username);
      expect(updated.email).toBe(user.email);
      expect(updated.role).toBe(user.role);
      expect(updated.isActive).toBe(user.isActive);
      expect(updated.businessUnitIds).toEqual(user.businessUnitIds);
      expect(updated.createdAt).toBe(user.createdAt);
      expect(updated.toCreateInput().passwordHash).toBe(user.toCreateInput().passwordHash);
    });

    it('should preserve name and phone when neither is provided', () => {
      const user = buildUser();
      const updated = user.withProfile({});

      expect(updated.name).toBe(user.name);
      expect(updated.phone).toBe(user.phone);
    });
  });

  describe('withPasswordHash', () => {
    it('should return a new instance with only the hash replaced', () => {
      const user = buildUser({ passwordHash: 'old-hash' });
      const updated = user.withPasswordHash('new-hash');

      expect(updated).not.toBe(user);
      expect(updated.toCreateInput().passwordHash).toBe('new-hash');
    });

    it('should preserve every other field', () => {
      const user = buildUser({ passwordHash: 'old-hash' });
      const updated = user.withPasswordHash('new-hash');

      expect(updated.id).toBe(user.id);
      expect(updated.businessUnitIds).toEqual(user.businessUnitIds);
      expect(updated.username).toBe(user.username);
      expect(updated.name).toBe(user.name);
      expect(updated.email).toBe(user.email);
      expect(updated.phone).toBe(user.phone);
      expect(updated.createdAt).toBe(user.createdAt);
      expect(updated.updatedAt).toBe(user.updatedAt);
      expect(updated.updatedBy).toBe(user.updatedBy);
      expect(updated.role).toBe(user.role);
      expect(updated.isActive).toBe(user.isActive);
    });

    it('should leave the original instance untouched', () => {
      const user = buildUser({ passwordHash: 'old-hash' });
      user.withPasswordHash('new-hash');

      expect(user.toCreateInput().passwordHash).toBe('old-hash');
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
