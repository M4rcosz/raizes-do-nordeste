import { beforeEach, describe, expect, it } from '@jest/globals';
import { ReactivateUserUseCase } from './reactivate-user.use-case';
import { User } from '../../domain/entities/user.entity';
import {
  CreateUserInput,
  UpdateProfileInput,
  UserRepository,
} from '../../domain/repositories/user.repository';
import { UserRole } from '../../domain/value-objects/user-role';
import { UserCreationForbiddenError } from '../errors/user-creation-forbidden.error';
import { UserReactivationConflictError } from '../errors/user-reactivation-conflict.error';
import { UserNotFoundError } from '../errors/user-not-found.error';
import { BusinessUnitScopeError } from '@shared/errors/application/business-unit-scope.error';
import { AuditLogInput, AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';

// In-memory fake. reactivateIfRole honors the (role, isActive=false) guard like
// the real conditional UPDATE: it only flips when the stored role still matches
// expectedRole and the user is inactive, returning null otherwise.
class FakeUserRepository implements UserRepository {
  readonly store = new Map<string, User>();
  readonly reactivateCalls: { id: string; expectedRole: UserRole; updatedById: string | null }[] =
    [];

  // Seeds a user as inactive by default (the target state for reactivation).
  seed(id: string, role: UserRole, isActive = false): void {
    this.store.set(id, this.build(id, role, isActive, null));
  }

  // Arms a concurrent role change that lands AFTER findById but BEFORE the write.
  private pendingRoleChange?: { id: string; role: UserRole };

  changeRoleAfterRead(id: string, role: UserRole): void {
    this.pendingRoleChange = { id, role };
  }

  findByUsername(): Promise<User | null> {
    return Promise.resolve(null);
  }

  findActiveCustomerByContact(): Promise<User | null> {
    return Promise.reject(new Error('not used'));
  }

  findById(id: string): Promise<User | null> {
    const snapshot = this.store.get(id) ?? null;
    if (this.pendingRoleChange && this.pendingRoleChange.id === id) {
      const current = this.store.get(id);
      if (current) {
        this.store.set(
          id,
          this.build(id, this.pendingRoleChange.role, current.isActive, current.updatedBy),
        );
      }
      this.pendingRoleChange = undefined;
    }
    return Promise.resolve(snapshot);
  }

  create(_input: CreateUserInput): Promise<User> {
    return Promise.reject(new Error('not used'));
  }

  deactivateIfRole(): Promise<User | null> {
    return Promise.reject(new Error('not used'));
  }

  reactivateIfRole(
    id: string,
    expectedRole: UserRole,
    updatedById: string | null,
  ): Promise<User | null> {
    this.reactivateCalls.push({ id, expectedRole, updatedById });
    const current = this.store.get(id);
    // Guard: must exist, must match expectedRole, must be inactive.
    if (!current || current.role !== expectedRole || current.isActive) {
      return Promise.resolve(null);
    }
    const updated = this.build(id, current.role, true, updatedById);
    this.store.set(id, updated);
    return Promise.resolve(updated);
  }

  updateProfile(
    _id: string,
    _data: UpdateProfileInput,
    _updatedById: string,
  ): Promise<User | null> {
    return Promise.reject(new Error('not used'));
  }

  private build(id: string, role: UserRole, isActive: boolean, updatedById: string | null): User {
    return new User(
      id,
      ['bu-1'],
      `user-${id}`,
      `Name ${id}`,
      null,
      'hash',
      null,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
      updatedById,
      role,
      isActive,
    );
  }

  updatePasswordHash(): Promise<User | null> {
    return Promise.reject(new Error('not used'));
  }

  findMany(): Promise<User[]> {
    return Promise.reject(new Error('not used'));
  }

  replaceBusinessUnits(): Promise<User | null> {
    return Promise.reject(new Error('not used'));
  }
}

class FakeAuditLogger implements AuditLogger {
  readonly entries: AuditLogInput[] = [];

  log(input: AuditLogInput): Promise<void> {
    this.entries.push(input);
    return Promise.resolve();
  }
}

describe('ReactivateUserUseCase', () => {
  let repo: FakeUserRepository;
  let audit: FakeAuditLogger;
  let useCase: ReactivateUserUseCase;

  beforeEach(() => {
    repo = new FakeUserRepository();
    audit = new FakeAuditLogger();
    useCase = new ReactivateUserUseCase(repo, audit);
  });

  describe('ADMIN actor', () => {
    const admin = { id: 'admin-1', role: UserRole.ADMIN, businessUnitIds: [] };

    it.each([
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.ATTENDANT,
      UserRole.KITCHEN,
      UserRole.CUSTOMER,
    ])('should reactivate a %s target', async (role) => {
      repo.seed('target-1', role, false);

      const updated = await useCase.execute(admin, 'target-1');

      expect(updated.isActive).toBe(true);
      expect(repo.reactivateCalls).toEqual([
        { id: 'target-1', expectedRole: role, updatedById: 'admin-1' },
      ]);
    });

    it('should audit USER_REACTIVATED under the actor', async () => {
      repo.seed('target-1', UserRole.ATTENDANT, false);

      await useCase.execute(admin, 'target-1');

      expect(audit.entries[0]).toMatchObject({
        userId: 'admin-1',
        action: AUDIT_ACTIONS.USER_REACTIVATED,
        entity: 'User',
        entityId: 'target-1',
      });
    });
  });

  describe('MANAGER actor', () => {
    const manager = { id: 'mgr-1', role: UserRole.MANAGER, businessUnitIds: ['bu-1'] };

    it.each([UserRole.ATTENDANT, UserRole.KITCHEN])(
      'should reactivate a %s target',
      async (role) => {
        repo.seed('target-1', role, false);

        const updated = await useCase.execute(manager, 'target-1');

        expect(updated.isActive).toBe(true);
      },
    );

    it.each([UserRole.ADMIN, UserRole.MANAGER, UserRole.CUSTOMER])(
      'should reject reactivating a %s target with FORBIDDEN',
      async (role) => {
        repo.seed('target-1', role, false);

        await expect(useCase.execute(manager, 'target-1')).rejects.toBeInstanceOf(
          UserCreationForbiddenError,
        );
        expect(repo.reactivateCalls).toHaveLength(0);
      },
    );

    it('should reject (not-found) when the target unit is outside the manager scope', async () => {
      const foreignManager = { id: 'mgr-2', role: UserRole.MANAGER, businessUnitIds: ['bu-9'] };
      repo.seed('target-1', UserRole.ATTENDANT, false);

      await expect(useCase.execute(foreignManager, 'target-1')).rejects.toBeInstanceOf(
        BusinessUnitScopeError,
      );
      expect(repo.reactivateCalls).toHaveLength(0);
    });
  });

  it('should throw NOT_FOUND when the target does not exist', async () => {
    const admin = { id: 'admin-1', role: UserRole.ADMIN, businessUnitIds: [] };

    await expect(useCase.execute(admin, 'ghost')).rejects.toBeInstanceOf(UserNotFoundError);
    expect(repo.reactivateCalls).toHaveLength(0);
  });

  it('should throw CONFLICT when the role changes between read and write', async () => {
    // MANAGER reads+authorizes against ATTENDANT, but the row becomes ADMIN
    // after that read and before the guarded write.
    const manager = { id: 'mgr-1', role: UserRole.MANAGER, businessUnitIds: ['bu-1'] };
    repo.seed('target-1', UserRole.ATTENDANT, false);
    repo.changeRoleAfterRead('target-1', UserRole.ADMIN);

    await expect(useCase.execute(manager, 'target-1')).rejects.toBeInstanceOf(
      UserReactivationConflictError,
    );
    expect(repo.reactivateCalls).toEqual([
      { id: 'target-1', expectedRole: UserRole.ATTENDANT, updatedById: 'mgr-1' },
    ]);
    expect(repo.store.get('target-1')?.isActive).toBe(false);
  });

  it('should throw CONFLICT when the user is already active (guard isActive:false)', async () => {
    const admin = { id: 'admin-1', role: UserRole.ADMIN, businessUnitIds: [] };
    // Seed as already active.
    repo.seed('target-1', UserRole.ATTENDANT, true);

    await expect(useCase.execute(admin, 'target-1')).rejects.toBeInstanceOf(
      UserReactivationConflictError,
    );
    expect(repo.reactivateCalls).toHaveLength(1);
  });
});
