import { beforeEach, describe, expect, it } from '@jest/globals';
import { ChangePasswordUseCase } from './change-password.use-case';
import { User } from '../../domain/entities/user.entity';
import { PasswordHasher } from '../../domain/ports/password-hasher.port';
import { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import { UserRole } from '../../domain/value-objects/user-role';
import { createFakeUserRepository } from './__fakes__/user-repository.fake';
import { InvalidCredentialsError } from '../errors/invalid-credentials.error';
import { SamePasswordError } from '../errors/same-password.error';
import { UserNotFoundError } from '../errors/user-not-found.error';
import { AuditLogInput, AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { TransactionContext, TransactionRunner } from '@shared/transaction/transaction-runner.port';

// Deterministic hasher so tests can reason about hashes without argon2. The decoy
// (null hash) always fails, matching the real port's contract.
const HASH_PREFIX = 'hashed:';

class FakePasswordHasher implements PasswordHasher {
  hash(plainPassword: string): Promise<string> {
    return Promise.resolve(`${HASH_PREFIX}${plainPassword}`);
  }

  verify(passwordHash: string | null, plainPassword: string): Promise<boolean> {
    if (passwordHash === null) {
      return Promise.resolve(false);
    }
    return Promise.resolve(passwordHash === `${HASH_PREFIX}${plainPassword}`);
  }
}

class FakeRefreshTokenRepository implements RefreshTokenRepository {
  readonly revokeAllCalls: { userId: string; tx?: TransactionContext }[] = [];

  findByTokenHash(): Promise<null> {
    return Promise.reject(new Error('not used'));
  }

  save(): Promise<void> {
    return Promise.reject(new Error('not used'));
  }

  revoke(): Promise<number> {
    return Promise.reject(new Error('not used'));
  }

  revokeChainFrom(): Promise<void> {
    return Promise.reject(new Error('not used'));
  }

  revokeAllActiveForUser(userId: string, tx?: TransactionContext): Promise<number> {
    this.revokeAllCalls.push({ userId, tx });
    return Promise.resolve(this.revokeAllCalls.length);
  }
}

class FakeAuditLogger implements AuditLogger {
  readonly entries: AuditLogInput[] = [];
  private shouldThrow = false;

  failNext(): void {
    this.shouldThrow = true;
  }

  log(input: AuditLogInput): Promise<void> {
    if (this.shouldThrow) {
      return Promise.reject(new Error('audit down'));
    }
    this.entries.push(input);
    return Promise.resolve();
  }
}

// Runs the work with a sentinel tx so callers can assert the context was threaded.
class FakeTransactionRunner implements TransactionRunner {
  static readonly TX: TransactionContext = Symbol('fake-tx');

  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return work(FakeTransactionRunner.TX);
  }
}

const buildUser = (id: string, passwordHash: string): User =>
  new User(
    id,
    'bu-1',
    `user-${id}`,
    `Name ${id}`,
    null,
    passwordHash,
    null,
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-02T00:00:00Z'),
    null,
    UserRole.CUSTOMER,
    true,
  );

describe('ChangePasswordUseCase', () => {
  const CURRENT = 'OldPass!2024';
  const NEW = 'N3w-Str0ng-Pass!';

  let refreshTokens: FakeRefreshTokenRepository;
  let hasher: FakePasswordHasher;
  let transactions: FakeTransactionRunner;
  let audit: FakeAuditLogger;

  beforeEach(() => {
    refreshTokens = new FakeRefreshTokenRepository();
    hasher = new FakePasswordHasher();
    transactions = new FakeTransactionRunner();
    audit = new FakeAuditLogger();
  });

  const buildUseCase = (
    overrides: Parameters<typeof createFakeUserRepository>[0],
  ): ChangePasswordUseCase => {
    const users = createFakeUserRepository(overrides);
    return new ChangePasswordUseCase(users, refreshTokens, hasher, transactions, audit);
  };

  it('should rotate the hash, revoke all active tokens, and audit without secrets', async () => {
    const user = buildUser('user-1', `${HASH_PREFIX}${CURRENT}`);
    const updateCalls: { id: string; newPasswordHash: string; updatedById: string }[] = [];
    const useCase = buildUseCase({
      findById: () => Promise.resolve(user),
      updatePasswordHash: (id, newPasswordHash, updatedById, tx) => {
        updateCalls.push({ id, newPasswordHash, updatedById });
        expect(tx).toBe(FakeTransactionRunner.TX);
        return Promise.resolve(user.withPasswordHash(newPasswordHash));
      },
    });

    await useCase.execute('user-1', { currentPassword: CURRENT, newPassword: NEW });

    // Hash rotated to the new password's hash, recorded against the actor.
    expect(updateCalls).toEqual([
      { id: 'user-1', newPasswordHash: `${HASH_PREFIX}${NEW}`, updatedById: 'user-1' },
    ]);
    // All active sessions killed inside the same tx.
    expect(refreshTokens.revokeAllCalls).toEqual([
      { userId: 'user-1', tx: FakeTransactionRunner.TX },
    ]);
    // Audit emitted, carrying no password or hash, and the revoked session count.
    const entry = audit.entries[0];
    expect(entry).toMatchObject({
      userId: 'user-1',
      action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
      entity: 'User',
      entityId: 'user-1',
    });
    // revokeAllCalls.length == 1 at the time of the call, so revokedSessions == 1.
    expect(entry.metadata).toEqual({ revokedSessions: 1 });
    expect(JSON.stringify(entry)).not.toContain(CURRENT);
    expect(JSON.stringify(entry)).not.toContain(NEW);
    expect(JSON.stringify(entry)).not.toContain(HASH_PREFIX);
  });

  it('should reject a wrong current password and persist nothing', async () => {
    const user = buildUser('user-1', `${HASH_PREFIX}${CURRENT}`);
    let updateCalled = false;
    const useCase = buildUseCase({
      findById: () => Promise.resolve(user),
      updatePasswordHash: () => {
        updateCalled = true;
        return Promise.resolve(user);
      },
    });

    await expect(
      useCase.execute('user-1', { currentPassword: 'wrong-password', newPassword: NEW }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(updateCalled).toBe(false);
    expect(refreshTokens.revokeAllCalls).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it('should check the current password before the reuse rule', async () => {
    const user = buildUser('user-1', `${HASH_PREFIX}${CURRENT}`);
    const useCase = buildUseCase({ findById: () => Promise.resolve(user) });

    // Wrong current AND new === current: must surface the credentials error, not
    // SamePasswordError, proving ownership is verified before any reuse check.
    await expect(
      useCase.execute('user-1', { currentPassword: 'wrong', newPassword: 'wrong' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('should reject when the new password equals the current one', async () => {
    const user = buildUser('user-1', `${HASH_PREFIX}${CURRENT}`);
    let updateCalled = false;
    const useCase = buildUseCase({
      findById: () => Promise.resolve(user),
      updatePasswordHash: () => {
        updateCalled = true;
        return Promise.resolve(user);
      },
    });

    await expect(
      useCase.execute('user-1', { currentPassword: CURRENT, newPassword: CURRENT }),
    ).rejects.toBeInstanceOf(SamePasswordError);

    expect(updateCalled).toBe(false);
    expect(refreshTokens.revokeAllCalls).toHaveLength(0);
  });

  it('should throw NOT_FOUND when the user does not exist', async () => {
    const useCase = buildUseCase({ findById: () => Promise.resolve(null) });

    await expect(
      useCase.execute('ghost', { currentPassword: CURRENT, newPassword: NEW }),
    ).rejects.toBeInstanceOf(UserNotFoundError);

    expect(refreshTokens.revokeAllCalls).toHaveLength(0);
  });

  it('should reject an inactive user before verifying the password or persisting anything', async () => {
    // Same error as sign-in (InvalidCredentialsError) so deactivation state is
    // not revealed through a different status code to a caller with a stale token.
    const inactive = new User(
      'user-1',
      'bu-1',
      'user-user-1',
      'Name user-1',
      null,
      `${HASH_PREFIX}${CURRENT}`,
      null,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
      null,
      UserRole.CUSTOMER,
      false,
    );
    // updatePasswordHash is not overridden: if called it throws "not stubbed",
    // which would make this test fail with the wrong error type.
    const useCase = buildUseCase({ findById: () => Promise.resolve(inactive) });

    await expect(
      useCase.execute('user-1', { currentPassword: CURRENT, newPassword: NEW }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(refreshTokens.revokeAllCalls).toHaveLength(0);
  });

  it('should throw NOT_FOUND when the row vanishes during the update', async () => {
    const user = buildUser('user-1', `${HASH_PREFIX}${CURRENT}`);
    const useCase = buildUseCase({
      findById: () => Promise.resolve(user),
      updatePasswordHash: () => Promise.resolve(null),
    });

    await expect(
      useCase.execute('user-1', { currentPassword: CURRENT, newPassword: NEW }),
    ).rejects.toBeInstanceOf(UserNotFoundError);

    // Revoke never runs because the guarded update found no row to rotate.
    expect(refreshTokens.revokeAllCalls).toHaveLength(0);
  });

  it('should not fail the change when audit throws (best-effort)', async () => {
    const user = buildUser('user-1', `${HASH_PREFIX}${CURRENT}`);
    const useCase = buildUseCase({
      findById: () => Promise.resolve(user),
      updatePasswordHash: (_id, newPasswordHash) =>
        Promise.resolve(user.withPasswordHash(newPasswordHash)),
    });
    audit.failNext();

    await expect(
      useCase.execute('user-1', { currentPassword: CURRENT, newPassword: NEW }),
    ).resolves.toBeUndefined();

    // Business side effects still happened despite the audit failure.
    expect(refreshTokens.revokeAllCalls).toHaveLength(1);
  });
});
