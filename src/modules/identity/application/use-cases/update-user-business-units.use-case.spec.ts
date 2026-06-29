import { beforeEach, describe, expect, it } from '@jest/globals';
import type { TransactionRunner } from '@shared/transaction/transaction-runner.port';
import {
  UpdateUserBusinessUnitsUseCase,
  type UpdateUserBusinessUnitsActor,
} from './update-user-business-units.use-case';
import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/value-objects/user-role';
import { UserCreationForbiddenError } from '../errors/user-creation-forbidden.error';
import { UserNotFoundError } from '../errors/user-not-found.error';
import { InvalidBusinessUnitError } from '../errors/invalid-business-unit.error';
import { AuditLogInput, AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { createFakeUserRepository } from './__fakes__/user-repository.fake';

const TX = Symbol('tx');

// Runs work with a fixed tx token, mirroring the real unit of work without a DB.
const transactions: TransactionRunner = {
  run: <T>(work: (tx: unknown) => Promise<T>): Promise<T> => work(TX),
};

const buildUser = (id: string, role: UserRole, units: string[]): User =>
  new User(
    id,
    units,
    `user-${id}`,
    `Name ${id}`,
    null,
    'hash',
    null,
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-02T00:00:00Z'),
    null,
    role,
    true,
  );

class FakeAuditLogger implements AuditLogger {
  readonly entries: AuditLogInput[] = [];
  log(input: AuditLogInput): Promise<void> {
    this.entries.push(input);
    return Promise.resolve();
  }
}

const admin: UpdateUserBusinessUnitsActor = { id: 'admin-1', role: UserRole.ADMIN };

describe('UpdateUserBusinessUnitsUseCase', () => {
  let audit: FakeAuditLogger;

  beforeEach(() => {
    audit = new FakeAuditLogger();
  });

  it('replaces the link set and audits USER_BUSINESS_UNITS_CHANGED under the actor', async () => {
    const replaceCalls: { id: string; units: string[]; updatedById: string; tx: unknown }[] = [];
    const repo = createFakeUserRepository({
      findById: () => Promise.resolve(buildUser('target-1', UserRole.ATTENDANT, ['bu-1'])),
      replaceBusinessUnits: (id, units, updatedById, tx) => {
        replaceCalls.push({ id, units, updatedById, tx });
        return Promise.resolve(buildUser(id, UserRole.ATTENDANT, units));
      },
    });
    const useCase = new UpdateUserBusinessUnitsUseCase(repo, transactions, audit);

    const result = await useCase.execute(admin, 'target-1', ['bu-2', 'bu-3']);

    expect(result.businessUnitIds).toEqual(['bu-2', 'bu-3']);
    expect(replaceCalls).toEqual([
      { id: 'target-1', units: ['bu-2', 'bu-3'], updatedById: 'admin-1', tx: TX },
    ]);
    expect(audit.entries[0]).toMatchObject({
      userId: 'admin-1',
      action: AUDIT_ACTIONS.USER_BUSINESS_UNITS_CHANGED,
      entity: 'User',
      entityId: 'target-1',
      metadata: { businessUnitIds: ['bu-2', 'bu-3'] },
    });
  });

  it('rejects a non-admin actor with FORBIDDEN before touching the repo', async () => {
    const repo = createFakeUserRepository();
    const useCase = new UpdateUserBusinessUnitsUseCase(repo, transactions, audit);

    await expect(
      useCase.execute({ id: 'mgr-1', role: UserRole.MANAGER }, 'target-1', ['bu-1']),
    ).rejects.toBeInstanceOf(UserCreationForbiddenError);
  });

  it.each([UserRole.CUSTOMER, UserRole.ADMIN])(
    'rejects a unit-unbound %s target with FORBIDDEN',
    async (targetRole) => {
      const repo = createFakeUserRepository({
        findById: () => Promise.resolve(buildUser('target-1', targetRole, [])),
      });
      const useCase = new UpdateUserBusinessUnitsUseCase(repo, transactions, audit);

      await expect(useCase.execute(admin, 'target-1', ['bu-1'])).rejects.toBeInstanceOf(
        UserCreationForbiddenError,
      );
    },
  );

  it('throws NOT_FOUND when the target does not exist', async () => {
    const repo = createFakeUserRepository({ findById: () => Promise.resolve(null) });
    const useCase = new UpdateUserBusinessUnitsUseCase(repo, transactions, audit);

    await expect(useCase.execute(admin, 'ghost', ['bu-1'])).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });

  it('throws NOT_FOUND when the user vanishes during the replace (null)', async () => {
    const repo = createFakeUserRepository({
      findById: () => Promise.resolve(buildUser('target-1', UserRole.KITCHEN, ['bu-1'])),
      replaceBusinessUnits: () => Promise.resolve(null),
    });
    const useCase = new UpdateUserBusinessUnitsUseCase(repo, transactions, audit);

    await expect(useCase.execute(admin, 'target-1', ['bu-1'])).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    expect(audit.entries).toHaveLength(0);
  });

  it('bubbles InvalidBusinessUnitError when a unit id does not exist (FK)', async () => {
    const repo = createFakeUserRepository({
      findById: () => Promise.resolve(buildUser('target-1', UserRole.KITCHEN, ['bu-1'])),
      replaceBusinessUnits: () => Promise.reject(new InvalidBusinessUnitError()),
    });
    const useCase = new UpdateUserBusinessUnitsUseCase(repo, transactions, audit);

    await expect(useCase.execute(admin, 'target-1', ['ghost-bu'])).rejects.toBeInstanceOf(
      InvalidBusinessUnitError,
    );
  });
});
