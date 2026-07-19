import { UserRepository } from '@modules/identity/domain/repositories/user.repository';

/**
 * Returns a UserRepository whose every method rejects with a clear "not stubbed"
 * error by default. Pass only the methods each test actually exercises via overrides.
 * Keeping the default as a reject (not resolve-null) makes accidental calls visible
 * in test output rather than silently passing.
 */
export function createFakeUserRepository(overrides?: Partial<UserRepository>): UserRepository {
  return {
    findByUsername: () =>
      Promise.reject(new Error('FakeUserRepository.findByUsername not stubbed')),
    findById: () => Promise.reject(new Error('FakeUserRepository.findById not stubbed')),
    findActiveCustomerByContact: () =>
      Promise.reject(new Error('FakeUserRepository.findActiveCustomerByContact not stubbed')),
    create: () => Promise.reject(new Error('FakeUserRepository.create not stubbed')),
    deactivateIfRole: () =>
      Promise.reject(new Error('FakeUserRepository.deactivateIfRole not stubbed')),
    reactivateIfRole: () =>
      Promise.reject(new Error('FakeUserRepository.reactivateIfRole not stubbed')),
    updateProfile: () => Promise.reject(new Error('FakeUserRepository.updateProfile not stubbed')),
    updatePasswordHash: () =>
      Promise.reject(new Error('FakeUserRepository.updatePasswordHash not stubbed')),
    findMany: () => Promise.reject(new Error('FakeUserRepository.findMany not stubbed')),
    replaceBusinessUnits: () =>
      Promise.reject(new Error('FakeUserRepository.replaceBusinessUnits not stubbed')),
    ...overrides,
  };
}
