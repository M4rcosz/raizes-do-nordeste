import { beforeEach, describe, expect, it } from '@jest/globals';
import { LookupCustomerUseCase } from './lookup-customer.use-case';
import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/value-objects/user-role';
import type { CustomerContact } from '../../domain/repositories/user.repository';
import { UserNotFoundError } from '../errors/user-not-found.error';
import { UsersFetchError } from '../errors/users-fetch.error';
import { createFakeUserRepository } from './__fakes__/user-repository.fake';

const buildCustomer = (id: string): User =>
  new User(
    id,
    [],
    `user-${id}`,
    `Name ${id}`,
    'maria@example.com',
    'hash',
    '+5581999999999',
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-02T00:00:00Z'),
    null,
    UserRole.CUSTOMER,
    true,
  );

describe('LookupCustomerUseCase', () => {
  let receivedContact: CustomerContact | undefined;

  const buildUseCase = (
    result: User | null | (() => Promise<User | null>),
  ): LookupCustomerUseCase => {
    const repo = createFakeUserRepository({
      findActiveCustomerByContact: (contact: CustomerContact) => {
        receivedContact = contact;
        return typeof result === 'function' ? result() : Promise.resolve(result);
      },
    });
    return new LookupCustomerUseCase(repo);
  };

  beforeEach(() => {
    receivedContact = undefined;
  });

  it('resolves a customer by phone and forwards only the phone term', async () => {
    const useCase = buildUseCase(buildCustomer('u-1'));

    const user = await useCase.execute({ phone: '+5581999999999' });

    expect(receivedContact).toEqual({ phone: '+5581999999999' });
    expect(user.id).toBe('u-1');
  });

  it('resolves a customer by email and forwards only the email term', async () => {
    const useCase = buildUseCase(buildCustomer('u-2'));

    const user = await useCase.execute({ email: 'maria@example.com' });

    expect(receivedContact).toEqual({ email: 'maria@example.com' });
    expect(user.id).toBe('u-2');
  });

  it('trims the contact value before querying', async () => {
    const useCase = buildUseCase(buildCustomer('u-1'));

    await useCase.execute({ phone: '  +5581999999999  ' });

    expect(receivedContact).toEqual({ phone: '+5581999999999' });
  });

  it('throws UserNotFoundError when nothing matches', async () => {
    const useCase = buildUseCase(null);

    await expect(useCase.execute({ phone: '+550000000000' })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });

  // The repo query filters on role and isActive, so staff and deactivated accounts
  // come back as a plain null. Asserting the same 404 surfaces here guards the
  // "never distinguish the failure modes" rule against a future post-filter refactor.
  it('reports a staff or deactivated account as the same not-found', async () => {
    const useCase = buildUseCase(null);

    await expect(useCase.execute({ email: 'admin@example.com' })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });

  it('does not query and reports not-found when neither contact field is given', async () => {
    const useCase = buildUseCase(buildCustomer('u-1'));

    await expect(useCase.execute({})).rejects.toBeInstanceOf(UserNotFoundError);
    expect(receivedContact).toBeUndefined();
  });

  it('does not query and reports not-found when both contact fields are given', async () => {
    const useCase = buildUseCase(buildCustomer('u-1'));

    await expect(
      useCase.execute({ phone: '+5581999999999', email: 'maria@example.com' }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
    expect(receivedContact).toBeUndefined();
  });

  it('treats a whitespace-only value as absent rather than an empty match term', async () => {
    const useCase = buildUseCase(buildCustomer('u-1'));

    await expect(useCase.execute({ phone: '   ' })).rejects.toBeInstanceOf(UserNotFoundError);
    expect(receivedContact).toBeUndefined();
  });

  it('wraps repository failures in UsersFetchError', async () => {
    const useCase = buildUseCase(() => Promise.reject(new Error('db down')));

    await expect(useCase.execute({ phone: '+5581999999999' })).rejects.toBeInstanceOf(
      UsersFetchError,
    );
  });
});
