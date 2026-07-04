import { beforeEach, describe, expect, it } from '@jest/globals';
import { GetMyProfileUseCase } from './get-my-profile.use-case';
import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/value-objects/user-role';
import { UserNotFoundError } from '../errors/user-not-found.error';
import { UsersFetchError } from '../errors/users-fetch.error';
import { createFakeUserRepository } from './__fakes__/user-repository.fake';

const buildUser = (id: string): User =>
  new User(
    id,
    ['bu-1'],
    `user-${id}`,
    `Name ${id}`,
    'user@example.com',
    'hash',
    '+5511999999999',
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-02T00:00:00Z'),
    null,
    UserRole.CUSTOMER,
    true,
  );

describe('GetMyProfileUseCase', () => {
  let lookedUpId: string | undefined;

  const buildUseCase = (
    result: User | null | (() => Promise<User | null>),
  ): GetMyProfileUseCase => {
    const repo = createFakeUserRepository({
      findById: (id: string) => {
        lookedUpId = id;
        return typeof result === 'function' ? result() : Promise.resolve(result);
      },
    });
    return new GetMyProfileUseCase(repo);
  };

  beforeEach(() => {
    lookedUpId = undefined;
  });

  it('returns the authenticated user by their own id', async () => {
    const useCase = buildUseCase(buildUser('u-1'));

    const user = await useCase.execute('u-1');

    expect(lookedUpId).toBe('u-1');
    expect(user.id).toBe('u-1');
  });

  it('throws UserNotFoundError when the token maps to a deleted user', async () => {
    const useCase = buildUseCase(null);

    await expect(useCase.execute('u-gone')).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('wraps repository failures in UsersFetchError', async () => {
    const useCase = buildUseCase(() => Promise.reject(new Error('db down')));

    await expect(useCase.execute('u-1')).rejects.toBeInstanceOf(UsersFetchError);
  });
});
