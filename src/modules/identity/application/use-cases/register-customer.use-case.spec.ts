import { beforeEach, describe, expect, it } from '@jest/globals';
import { RegisterCustomerUseCase } from './register-customer.use-case';
import { User } from '../../domain/entities/user.entity';
import { PasswordHasher } from '../../domain/ports/password-hasher.port';
import { CreateUserInput } from '../../domain/repositories/user.repository';
import { UserAlreadyExistsError } from '../errors/user-already-exists.error';
import { AuditLogInput, AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { createFakeUserRepository } from './__fakes__/user-repository.fake';

// In-memory store shared across override closures within one test run.
function buildCollisionAwareCreate(store: Map<string, User>) {
  return (input: CreateUserInput): Promise<User> => {
    const collision = [...store.values()].some(
      (u) =>
        u.username === input.username ||
        (input.email !== null && u.email === input.email) ||
        (input.phone !== null && u.phone === input.phone),
    );
    if (collision) {
      return Promise.reject(new UserAlreadyExistsError());
    }
    const user = rebuild(input);
    store.set(input.id, user);
    return Promise.resolve(user);
  };
}

function rebuild(input: CreateUserInput): User {
  return new User(
    input.id,
    input.businessUnitId,
    input.username,
    input.name,
    input.email,
    input.passwordHash,
    input.phone,
    input.createdAt,
    input.updatedAt,
    null,
    input.role,
    input.isActive,
  );
}

class FakeHasher implements PasswordHasher {
  readonly hashed: string[] = [];

  hash(plain: string): Promise<string> {
    this.hashed.push(plain);
    // Opaque digest that does not echo the plaintext, so "hash != plaintext"
    // assertions are meaningful (a real argon2 hash never contains the password).
    return Promise.resolve(`argon2$${Buffer.from(plain).toString('base64')}`);
  }

  verify(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

class FakeAuditLogger implements AuditLogger {
  readonly entries: AuditLogInput[] = [];

  log(input: AuditLogInput): Promise<void> {
    this.entries.push(input);
    return Promise.resolve();
  }
}

describe('RegisterCustomerUseCase', () => {
  let created: CreateUserInput[];
  let store: Map<string, User>;
  let hasher: FakeHasher;
  let audit: FakeAuditLogger;
  let useCase: RegisterCustomerUseCase;

  beforeEach(() => {
    created = [];
    store = new Map<string, User>();
    hasher = new FakeHasher();
    audit = new FakeAuditLogger();

    const repo = createFakeUserRepository({
      findByUsername: () => Promise.resolve(null),
      findById: (id: string) => Promise.resolve(store.get(id) ?? null),
      create: (input: CreateUserInput) => {
        const createFn = buildCollisionAwareCreate(store);
        return createFn(input).then((u) => {
          created.push(input);
          return u;
        });
      },
    });

    useCase = new RegisterCustomerUseCase(repo, hasher, audit);
  });

  it('should always persist role CUSTOMER', async () => {
    await useCase.execute({ name: 'Maria', username: 'maria', password: 'password123' });

    expect(created).toHaveLength(1);
    expect(created[0]?.role).toBe('CUSTOMER');
  });

  it('should hash the password and never persist the plain text', async () => {
    await useCase.execute({ name: 'Maria', username: 'maria', password: 'password123' });

    expect(hasher.hashed).toEqual(['password123']);
    expect(created[0]?.passwordHash).toBe(await hasher.hash('password123'));
    expect(created[0]?.passwordHash).not.toContain('password123');
  });

  it('should default businessUnitId to null for a self-registered customer', async () => {
    await useCase.execute({ name: 'Maria', username: 'maria', password: 'password123' });

    expect(created[0]?.businessUnitId).toBeNull();
    expect(created[0]?.isActive).toBe(true);
  });

  it('should audit CUSTOMER_REGISTERED without leaking the password', async () => {
    const result = await useCase.execute({
      name: 'Maria',
      username: 'maria',
      password: 'super-secret',
    });

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      userId: result.id,
      action: AUDIT_ACTIONS.CUSTOMER_REGISTERED,
      entity: 'User',
      entityId: result.id,
    });
    expect(JSON.stringify(audit.entries[0])).not.toContain('super-secret');
  });

  it('should propagate UserAlreadyExistsError on a duplicate username', async () => {
    await useCase.execute({ name: 'Maria', username: 'maria', password: 'password123' });

    await expect(
      useCase.execute({ name: 'Other', username: 'maria', password: 'password123' }),
    ).rejects.toBeInstanceOf(UserAlreadyExistsError);
  });

  it('should still succeed when audit logging fails', async () => {
    const throwingAudit: AuditLogger = {
      log: () => Promise.reject(new Error('audit down')),
    };
    const repoForThrow = createFakeUserRepository({
      findByUsername: () => Promise.resolve(null),
      findById: () => Promise.resolve(null),
      create: (input: CreateUserInput) => Promise.resolve(rebuild(input)),
    });
    const uc = new RegisterCustomerUseCase(repoForThrow, hasher, throwingAudit);

    const result = await uc.execute({ name: 'Maria', username: 'maria', password: 'password123' });

    expect(result.username).toBe('maria');
  });
});
