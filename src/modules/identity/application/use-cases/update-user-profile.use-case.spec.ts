import { beforeEach, describe, expect, it } from '@jest/globals';
import { UpdateUserProfileUseCase } from './update-user-profile.use-case';
import { User } from '../../domain/entities/user.entity';
import {
  CreateUserInput,
  UpdateProfileInput,
  UserRepository,
} from '../../domain/repositories/user.repository';
import { UserRole } from '../../domain/value-objects/user-role';
import { UserNotFoundError } from '../errors/user-not-found.error';
import { UserAlreadyExistsError } from '../errors/user-already-exists.error';
import { AuditLogInput, AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';

class FakeUserRepository implements UserRepository {
  readonly store = new Map<string, User>();
  readonly updateProfileCalls: { id: string; data: UpdateProfileInput; updatedById: string }[] = [];

  // Controls what updateProfile returns (null simulates deleted-between-read-and-write).
  private forceUpdateResult?: User | null | Error;

  seed(
    id: string,
    overrides?: Partial<{ name: string; phone: string | null; role: UserRole; isActive: boolean }>,
  ): User {
    const user = new User(
      id,
      'bu-1',
      `user-${id}`,
      overrides?.name ?? `Name ${id}`,
      null,
      'hash',
      overrides?.phone ?? null,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
      null,
      overrides?.role ?? UserRole.CUSTOMER,
      overrides?.isActive ?? true,
    );
    this.store.set(id, user);
    return user;
  }

  setUpdateProfileResult(result: User | null | Error): void {
    this.forceUpdateResult = result;
  }

  findByUsername(): Promise<User | null> {
    return Promise.resolve(null);
  }

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }

  create(_input: CreateUserInput): Promise<User> {
    return Promise.reject(new Error('not used'));
  }

  deactivateIfRole(): Promise<User | null> {
    return Promise.reject(new Error('not used'));
  }

  reactivateIfRole(): Promise<User | null> {
    return Promise.reject(new Error('not used'));
  }

  updateProfile(id: string, data: UpdateProfileInput, updatedById: string): Promise<User | null> {
    this.updateProfileCalls.push({ id, data, updatedById });

    if (this.forceUpdateResult instanceof Error) {
      return Promise.reject(this.forceUpdateResult);
    }
    if (this.forceUpdateResult !== undefined) {
      return Promise.resolve(this.forceUpdateResult);
    }

    // Default: apply the update to whatever is in the store.
    const current = this.store.get(id);
    if (!current) {
      return Promise.resolve(null);
    }
    const updated = new User(
      current.id,
      current.businessUnitId,
      current.username,
      data.name ?? current.name,
      current.email,
      current.toCreateInput().passwordHash,
      data.phone !== undefined ? data.phone : current.phone,
      current.createdAt,
      new Date(),
      updatedById,
      current.role,
      current.isActive,
    );
    this.store.set(id, updated);
    return Promise.resolve(updated);
  }
}

class FakeAuditLogger implements AuditLogger {
  readonly entries: AuditLogInput[] = [];

  log(input: AuditLogInput): Promise<void> {
    this.entries.push(input);
    return Promise.resolve();
  }
}

describe('UpdateUserProfileUseCase', () => {
  let repo: FakeUserRepository;
  let audit: FakeAuditLogger;
  let useCase: UpdateUserProfileUseCase;

  beforeEach(() => {
    repo = new FakeUserRepository();
    audit = new FakeAuditLogger();
    useCase = new UpdateUserProfileUseCase(repo, audit);
  });

  it('should update only the name when phone is not provided', async () => {
    repo.seed('user-1', { name: 'Original', phone: '34999999999' });

    const result = await useCase.execute('user-1', { name: 'Novo Nome' });

    expect(result.name).toBe('Novo Nome');
    expect(repo.updateProfileCalls[0].data).toEqual({ name: 'Novo Nome' });
  });

  it('should update only the phone when name is not provided', async () => {
    repo.seed('user-1', { name: 'Original', phone: '34999999999' });

    const result = await useCase.execute('user-1', { phone: '34911112222' });

    expect(result.phone).toBe('34911112222');
    expect(repo.updateProfileCalls[0].data).toEqual({ phone: '34911112222' });
  });

  it('should update both name and phone when both are provided', async () => {
    repo.seed('user-1', { name: 'Original', phone: '34999999999' });

    const result = await useCase.execute('user-1', { name: 'Novo', phone: '34922223333' });

    expect(result.name).toBe('Novo');
    expect(result.phone).toBe('34922223333');
  });

  it('should pass actorId as updatedById', async () => {
    repo.seed('user-1');

    await useCase.execute('user-1', { name: 'Qualquer' });

    expect(repo.updateProfileCalls[0].updatedById).toBe('user-1');
  });

  it('should preserve email, role, isActive, and username after update', async () => {
    const original = repo.seed('user-1', { role: UserRole.CUSTOMER, isActive: true });

    const result = await useCase.execute('user-1', { name: 'Novo Nome' });

    expect(result.email).toBe(original.email);
    expect(result.role).toBe(original.role);
    expect(result.isActive).toBe(original.isActive);
    expect(result.username).toBe(original.username);
  });

  it('should throw NOT_FOUND when findById returns null', async () => {
    await expect(useCase.execute('ghost', { name: 'Test' })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    expect(repo.updateProfileCalls).toHaveLength(0);
  });

  it('should throw NOT_FOUND when updateProfile returns null (deleted between read and write)', async () => {
    repo.seed('user-1');
    repo.setUpdateProfileResult(null);

    await expect(useCase.execute('user-1', { name: 'Novo' })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });

  it('should bubble UserAlreadyExistsError when updateProfile throws it (phone collision)', async () => {
    repo.seed('user-1');
    repo.setUpdateProfileResult(new UserAlreadyExistsError('Phone already in use.'));

    await expect(useCase.execute('user-1', { phone: '34999999999' })).rejects.toBeInstanceOf(
      UserAlreadyExistsError,
    );
  });

  it('should audit USER_UPDATED with userId===actorId and updatedFields (no values)', async () => {
    repo.seed('user-1');

    await useCase.execute('user-1', { name: 'Novo Nome', phone: '34911112222' });

    const entry = audit.entries[0];
    expect(entry).toMatchObject({
      userId: 'user-1',
      action: AUDIT_ACTIONS.USER_UPDATED,
      entity: 'User',
      entityId: 'user-1',
    });
    const meta = entry.metadata as { updatedFields: string[] };
    expect(meta.updatedFields).toEqual(expect.arrayContaining(['name', 'phone']));
    expect(meta.updatedFields).toHaveLength(2);
  });

  it('should audit only the fields that were actually sent', async () => {
    repo.seed('user-1');

    await useCase.execute('user-1', { name: 'Novo Nome' });

    const meta = audit.entries[0].metadata as { updatedFields: string[] };
    expect(meta.updatedFields).toEqual(['name']);
  });
});
