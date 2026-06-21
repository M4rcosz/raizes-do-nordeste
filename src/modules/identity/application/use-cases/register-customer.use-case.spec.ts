import { beforeEach, describe, expect, it } from '@jest/globals';
import { RegisterCustomerUseCase } from './register-customer.use-case';
import { User } from '../../domain/entities/user.entity';
import { PasswordHasher } from '../../domain/ports/password-hasher.port';
import { CreateUserInput, UserRepository } from '../../domain/repositories/user.repository';
import { UserAlreadyExistsError } from '../errors/user-already-exists.error';
import { AuditLogInput, AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';

// In-memory fake: real behavior, no mock framework. Rejects duplicate username/email/phone
// with UserAlreadyExistsError (mirrors the Prisma P2002 translation).
class FakeUserRepository implements UserRepository {
  readonly created: CreateUserInput[] = [];
  private readonly store = new Map<string, User>();

  findByUsername(): Promise<User | null> {
    return Promise.resolve(null);
  }

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }

  create(input: CreateUserInput): Promise<User> {
    const collision = [...this.store.values()].some(
      (u) =>
        u.username === input.username ||
        (input.email !== null && u.email === input.email) ||
        (input.phone !== null && u.phone === input.phone),
    );
    if (collision) {
      return Promise.reject(new UserAlreadyExistsError());
    }
    this.created.push(input);
    this.store.set(input.id, this.rebuild(input));
    return Promise.resolve(this.rebuild(input));
  }

  deactivateIfRole(): Promise<User | null> {
    return Promise.reject(new Error('not used'));
  }

  private rebuild(input: CreateUserInput): User {
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
  let repo: FakeUserRepository;
  let hasher: FakeHasher;
  let audit: FakeAuditLogger;
  let useCase: RegisterCustomerUseCase;

  beforeEach(() => {
    repo = new FakeUserRepository();
    hasher = new FakeHasher();
    audit = new FakeAuditLogger();
    useCase = new RegisterCustomerUseCase(repo, hasher, audit);
  });

  it('should always persist role CUSTOMER', async () => {
    await useCase.execute({ name: 'Maria', username: 'maria', password: 'password123' });

    expect(repo.created).toHaveLength(1);
    expect(repo.created[0]?.role).toBe('CUSTOMER');
  });

  it('should hash the password and never persist the plain text', async () => {
    await useCase.execute({ name: 'Maria', username: 'maria', password: 'password123' });

    expect(hasher.hashed).toEqual(['password123']);
    expect(repo.created[0]?.passwordHash).toBe(await hasher.hash('password123'));
    expect(repo.created[0]?.passwordHash).not.toContain('password123');
  });

  it('should default businessUnitId to null for a self-registered customer', async () => {
    await useCase.execute({ name: 'Maria', username: 'maria', password: 'password123' });

    expect(repo.created[0]?.businessUnitId).toBeNull();
    expect(repo.created[0]?.isActive).toBe(true);
  });

  it('should audit CUSTOMER_REGISTERED without leaking the password', async () => {
    const created = await useCase.execute({
      name: 'Maria',
      username: 'maria',
      password: 'super-secret',
    });

    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      userId: created.id,
      action: AUDIT_ACTIONS.CUSTOMER_REGISTERED,
      entity: 'User',
      entityId: created.id,
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
    const uc = new RegisterCustomerUseCase(repo, hasher, throwingAudit);

    const created = await uc.execute({ name: 'Maria', username: 'maria', password: 'password123' });

    expect(created.username).toBe('maria');
  });
});
