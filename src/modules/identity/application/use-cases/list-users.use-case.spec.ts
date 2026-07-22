import { beforeEach, describe, expect, it } from '@jest/globals';
import { BusinessUnitScopeError } from '@shared/errors/application/business-unit-scope.error';
import { ListUsersUseCase } from './list-users.use-case';
import { User } from '../../domain/entities/user.entity';
import type { FindUsersInput } from '../../domain/repositories/user.repository';
import { UserRole } from '../../domain/value-objects/user-role';
import { UsersFetchError } from '../errors/users-fetch.error';
import { createFakeUserRepository } from './__fakes__/user-repository.fake';
import { encodeUserCursor } from '../user-keyset-cursor';

const buildUser = (id: string): User =>
  new User(
    id,
    ['bu-1'],
    `user-${id}`,
    `Name ${id}`,
    null,
    'hash',
    null,
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-02T00:00:00Z'),
    null,
    UserRole.ATTENDANT,
    true,
  );

const admin = { role: UserRole.ADMIN, businessUnitIds: [] as string[] };
const manager = (units: string[]) => ({ role: UserRole.MANAGER, businessUnitIds: units });

describe('ListUsersUseCase', () => {
  let calls: FindUsersInput[];

  const buildUseCase = (rows: User[] | (() => Promise<User[]>)): ListUsersUseCase => {
    const repo = createFakeUserRepository({
      findMany: (input: FindUsersInput) => {
        calls.push(input);
        return typeof rows === 'function' ? rows() : Promise.resolve(rows);
      },
    });
    return new ListUsersUseCase(repo);
  };

  beforeEach(() => {
    calls = [];
  });

  describe('ADMIN scope', () => {
    it('queries with no unit filter when none is requested', async () => {
      const useCase = buildUseCase([buildUser('u-1')]);

      const result = await useCase.execute({ actor: admin, limit: 20 });

      expect(calls[0].filters?.businessUnitIds).toBeUndefined();
      expect(result.data).toHaveLength(1);
    });

    it('pins the unit filter to a freely chosen businessUnitId', async () => {
      const useCase = buildUseCase([]);

      await useCase.execute({ actor: admin, businessUnitId: 'bu-9', limit: 20 });

      expect(calls[0].filters?.businessUnitIds).toEqual(['bu-9']);
    });
  });

  describe('role filter', () => {
    it('omits the role filter entirely when none is requested', async () => {
      const useCase = buildUseCase([buildUser('u-1')]);

      await useCase.execute({ actor: admin, limit: 20 });

      expect(calls[0].filters?.role).toBeUndefined();
    });

    it('lets an ADMIN reach CUSTOMERs with no unit filter attached', async () => {
      const useCase = buildUseCase([buildUser('u-1')]);

      await useCase.execute({ actor: admin, role: UserRole.CUSTOMER, limit: 20 });

      expect(calls[0].filters?.role).toBe(UserRole.CUSTOMER);
      expect(calls[0].filters?.businessUnitIds).toBeUndefined();
    });

    it('does not widen the MANAGER scope: role rides alongside the forced unit filter', async () => {
      const useCase = buildUseCase([]);

      await useCase.execute({ actor: manager(['bu-1']), role: UserRole.CUSTOMER, limit: 20 });

      expect(calls[0].filters?.role).toBe(UserRole.CUSTOMER);
      expect(calls[0].filters?.businessUnitIds).toEqual(['bu-1']);
    });

    it('still short-circuits an empty MANAGER scope without querying', async () => {
      const useCase = buildUseCase([buildUser('u-1')]);

      const result = await useCase.execute({
        actor: manager([]),
        role: UserRole.CUSTOMER,
        limit: 20,
      });

      expect(calls).toHaveLength(0);
      expect(result.data).toEqual([]);
    });
  });

  describe('MANAGER scope (forced to the claim)', () => {
    it('lists the union of the claim units when no businessUnitId is given', async () => {
      const useCase = buildUseCase([buildUser('u-1')]);

      await useCase.execute({ actor: manager(['bu-1', 'bu-2']), limit: 20 });

      expect(calls[0].filters?.businessUnitIds).toEqual(['bu-1', 'bu-2']);
    });

    it('narrows to a requested unit that is within the claim', async () => {
      const useCase = buildUseCase([]);

      await useCase.execute({
        actor: manager(['bu-1', 'bu-2']),
        businessUnitId: 'bu-2',
        limit: 20,
      });

      expect(calls[0].filters?.businessUnitIds).toEqual(['bu-2']);
    });

    it('rejects (not-found) a requested unit outside the claim and never queries (anti-IDOR)', async () => {
      const useCase = buildUseCase([]);

      await expect(
        useCase.execute({ actor: manager(['bu-1']), businessUnitId: 'bu-9', limit: 20 }),
      ).rejects.toBeInstanceOf(BusinessUnitScopeError);
      expect(calls).toHaveLength(0);
    });

    it('returns an empty page without querying when the claim is empty', async () => {
      const useCase = buildUseCase([]);

      const result = await useCase.execute({ actor: manager([]), limit: 20 });

      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
      expect(calls).toHaveLength(0);
    });
  });

  describe('text filters', () => {
    it('forwards username and email substrings', async () => {
      const useCase = buildUseCase([]);

      await useCase.execute({ actor: admin, username: 'joao', email: 'joao@', limit: 20 });

      expect(calls[0].filters?.username).toBe('joao');
      expect(calls[0].filters?.email).toBe('joao@');
    });
  });

  describe('cursor pagination', () => {
    it('over-fetches by one, trims, and exposes the next cursor when more remain', async () => {
      // limit 2 but repo returns 3 (limit+1) -> hasMore, trimmed to 2.
      const useCase = buildUseCase([buildUser('u-1'), buildUser('u-2'), buildUser('u-3')]);

      const result = await useCase.execute({ actor: admin, limit: 2 });

      expect(calls[0].take).toBe(3);
      expect(result.data).toHaveLength(2);
      expect(result.meta.hasMore).toBe(true);
      // Opaque keyset token, not the bare id: the next page compares sort VALUES so it
      // stays correct when u-2's role or unit changes between the two requests.
      expect(result.meta.nextCursor).toBe(
        encodeUserCursor(new Date('2026-01-01T00:00:00Z'), 'u-2'),
      );
    });

    it('reports no more pages when the result fits the limit', async () => {
      const useCase = buildUseCase([buildUser('u-1')]);

      const result = await useCase.execute({ actor: admin, limit: 2 });

      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.nextCursor).toBeNull();
    });
  });

  it('wraps a repository failure in UsersFetchError with cause', async () => {
    const dbError = new Error('DB down');
    const useCase = buildUseCase(() => Promise.reject(dbError));

    await expect(useCase.execute({ actor: admin, limit: 20 })).rejects.toBeInstanceOf(
      UsersFetchError,
    );
  });
});
