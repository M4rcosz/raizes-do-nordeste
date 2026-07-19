import { beforeEach, describe, expect, it } from '@jest/globals';
import { DeactivateUserUseCase } from './deactivate-user.use-case';
import { User } from '../../domain/entities/user.entity';
import { CreateUserInput, UserRepository } from '../../domain/repositories/user.repository';
import { UserRole } from '../../domain/value-objects/user-role';
import { UserCreationForbiddenError } from '../errors/user-creation-forbidden.error';
import { UserDeactivationConflictError } from '../errors/user-deactivation-conflict.error';
import { UserNotFoundError } from '../errors/user-not-found.error';
import { BusinessUnitScopeError } from '@shared/errors/application/business-unit-scope.error';
import { AuditLogInput, AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';

// In-memory fake. deactivateIfRole honors the (role, isActive) guard like the real
// conditional UPDATE: it only flips when the stored role still matches expectedRole
// and the user is active, returning null otherwise (stale snapshot).
class FakeUserRepository implements UserRepository {
  readonly store = new Map<string, User>();
  readonly deactivateCalls: { id: string; expectedRole: UserRole; updatedById: string | null }[] =
    [];

  seed(id: string, role: UserRole, isActive = true): void {
    this.store.set(id, this.build(id, role, isActive, null));
  }

  // Arms a concurrent role change that lands AFTER the next findById read but
  // BEFORE the guarded deactivateIfRole write, reproducing the read-then-write race.
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
    // Apply the armed change now: the use case has just read the old snapshot.
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

  reactivateIfRole(): Promise<User | null> {
    return Promise.reject(new Error('not used'));
  }

  updateProfile(): Promise<User | null> {
    return Promise.reject(new Error('not used'));
  }

  deactivateIfRole(
    id: string,
    expectedRole: UserRole,
    updatedById: string | null,
  ): Promise<User | null> {
    this.deactivateCalls.push({ id, expectedRole, updatedById });
    const current = this.store.get(id);
    if (!current || current.role !== expectedRole || !current.isActive) {
      return Promise.resolve(null);
    }
    const updated = this.build(id, current.role, false, updatedById);
    this.store.set(id, updated);
    return Promise.resolve(updated);
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

describe('DeactivateUserUseCase', () => {
  let repo: FakeUserRepository;
  let audit: FakeAuditLogger;
  let useCase: DeactivateUserUseCase;

  beforeEach(() => {
    repo = new FakeUserRepository();
    audit = new FakeAuditLogger();
    useCase = new DeactivateUserUseCase(repo, audit);
  });

  describe('ADMIN actor', () => {
    const admin = { id: 'admin-1', role: UserRole.ADMIN, businessUnitIds: [] };

    it.each([
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.ATTENDANT,
      UserRole.KITCHEN,
      UserRole.CUSTOMER,
    ])('should deactivate a %s target', async (role) => {
      repo.seed('target-1', role);

      const updated = await useCase.execute(admin, 'target-1');

      expect(updated.isActive).toBe(false);
      expect(repo.deactivateCalls).toEqual([
        { id: 'target-1', expectedRole: role, updatedById: 'admin-1' },
      ]);
    });

    it('should block self-deactivation before touching the repo', async () => {
      repo.seed('admin-1', UserRole.ADMIN);

      await expect(useCase.execute(admin, 'admin-1')).rejects.toBeInstanceOf(
        UserCreationForbiddenError,
      );
      expect(repo.deactivateCalls).toHaveLength(0);
    });

    it('should audit USER_DEACTIVATED under the actor', async () => {
      repo.seed('target-1', UserRole.ATTENDANT);

      await useCase.execute(admin, 'target-1');

      expect(audit.entries[0]).toMatchObject({
        userId: 'admin-1',
        action: AUDIT_ACTIONS.USER_DEACTIVATED,
        entity: 'User',
        entityId: 'target-1',
      });
    });
  });

  describe('MANAGER actor', () => {
    const manager = { id: 'mgr-1', role: UserRole.MANAGER, businessUnitIds: ['bu-1'] };

    it.each([UserRole.ATTENDANT, UserRole.KITCHEN])(
      'should deactivate a %s target',
      async (role) => {
        repo.seed('target-1', role);

        const updated = await useCase.execute(manager, 'target-1');

        expect(updated.isActive).toBe(false);
      },
    );

    it.each([UserRole.ADMIN, UserRole.MANAGER, UserRole.CUSTOMER])(
      'should reject deactivating a %s target with FORBIDDEN',
      async (role) => {
        repo.seed('target-1', role);

        await expect(useCase.execute(manager, 'target-1')).rejects.toBeInstanceOf(
          UserCreationForbiddenError,
        );
        expect(repo.deactivateCalls).toHaveLength(0);
      },
    );

    it('should reject (not-found) when the target unit is outside the manager scope', async () => {
      // Target lives in bu-1 (seed default); this manager is scoped to bu-9 only.
      const foreignManager = { id: 'mgr-2', role: UserRole.MANAGER, businessUnitIds: ['bu-9'] };
      repo.seed('target-1', UserRole.ATTENDANT);

      await expect(useCase.execute(foreignManager, 'target-1')).rejects.toBeInstanceOf(
        BusinessUnitScopeError,
      );
      expect(repo.deactivateCalls).toHaveLength(0);
    });
  });

  it('should throw NOT_FOUND when the target does not exist', async () => {
    const admin = { id: 'admin-1', role: UserRole.ADMIN, businessUnitIds: [] };

    await expect(useCase.execute(admin, 'ghost')).rejects.toBeInstanceOf(UserNotFoundError);
    expect(repo.deactivateCalls).toHaveLength(0);
  });

  it('should throw CONFLICT when the role changes between read and write', async () => {
    // MANAGER reads+authorizes against ATTENDANT, but the row becomes ADMIN after
    // that read and before the guarded write. The conditional UPDATE matches nothing
    // -> the authorization was decided on a stale snapshot.
    const manager = { id: 'mgr-1', role: UserRole.MANAGER, businessUnitIds: ['bu-1'] };
    repo.seed('target-1', UserRole.ATTENDANT);
    repo.changeRoleAfterRead('target-1', UserRole.ADMIN);

    await expect(useCase.execute(manager, 'target-1')).rejects.toBeInstanceOf(
      UserDeactivationConflictError,
    );
    // The write was attempted against the authorized role and rejected by the guard.
    expect(repo.deactivateCalls).toEqual([
      { id: 'target-1', expectedRole: UserRole.ATTENDANT, updatedById: 'mgr-1' },
    ]);
    expect(repo.store.get('target-1')?.isActive).toBe(true);
  });
});
