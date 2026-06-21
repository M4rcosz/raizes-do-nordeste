import { beforeEach, describe, expect, it } from '@jest/globals';
import { CreateUserCommand, CreateUserUseCase } from './create-user.use-case';
import { User } from '../../domain/entities/user.entity';
import { PasswordHasher } from '../../domain/ports/password-hasher.port';
import { CreateUserInput, UserRepository } from '../../domain/repositories/user.repository';
import { UserRole } from '../../domain/value-objects/user-role';
import { UserCreationForbiddenError } from '../errors/user-creation-forbidden.error';
import { AuditLogInput, AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';

class FakeUserRepository implements UserRepository {
  readonly created: CreateUserInput[] = [];

  findByUsername(): Promise<User | null> {
    return Promise.resolve(null);
  }

  findById(): Promise<User | null> {
    return Promise.resolve(null);
  }

  create(input: CreateUserInput): Promise<User> {
    this.created.push(input);
    return Promise.resolve(
      new User(
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
      ),
    );
  }

  deactivateIfRole(): Promise<User | null> {
    return Promise.reject(new Error('not used'));
  }
}

class FakeHasher implements PasswordHasher {
  readonly hashed: string[] = [];

  hash(plain: string): Promise<string> {
    this.hashed.push(plain);
    return Promise.resolve(`hashed:${plain}`);
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

describe('CreateUserUseCase', () => {
  let repo: FakeUserRepository;
  let hasher: FakeHasher;
  let audit: FakeAuditLogger;
  let useCase: CreateUserUseCase;

  const baseCommand = (role: UserRole): CreateUserCommand => ({
    name: 'João',
    username: 'joao',
    password: 'password123',
    role,
  });

  beforeEach(() => {
    repo = new FakeUserRepository();
    hasher = new FakeHasher();
    audit = new FakeAuditLogger();
    useCase = new CreateUserUseCase(repo, hasher, audit);
  });

  describe('ADMIN actor', () => {
    const admin = { id: 'admin-1', role: UserRole.ADMIN };

    it('should create an ADMIN user', async () => {
      const created = await useCase.execute(admin, baseCommand(UserRole.ADMIN));

      expect(created.role).toBe('ADMIN');
      expect(repo.created).toHaveLength(1);
    });

    it.each([UserRole.MANAGER, UserRole.ATTENDANT, UserRole.KITCHEN, UserRole.CUSTOMER])(
      'should create a %s user',
      async (role) => {
        const created = await useCase.execute(admin, baseCommand(role));
        expect(created.role).toBe(role);
      },
    );

    it('should hash the password and never persist plain text', async () => {
      await useCase.execute(admin, baseCommand(UserRole.ATTENDANT));

      expect(hasher.hashed).toEqual(['password123']);
      expect(repo.created[0]?.passwordHash).toBe('hashed:password123');
    });

    it('should audit USER_CREATED under the actor without leaking the password', async () => {
      const created = await useCase.execute(admin, {
        ...baseCommand(UserRole.ATTENDANT),
        password: 'top-secret',
      });

      expect(audit.entries[0]).toMatchObject({
        userId: 'admin-1',
        action: AUDIT_ACTIONS.USER_CREATED,
        entity: 'User',
        entityId: created.id,
      });
      expect(JSON.stringify(audit.entries[0])).not.toContain('top-secret');
    });
  });

  describe('MANAGER actor', () => {
    const manager = { id: 'mgr-1', role: UserRole.MANAGER };

    it.each([UserRole.ATTENDANT, UserRole.KITCHEN])('should create a %s user', async (role) => {
      const created = await useCase.execute(manager, baseCommand(role));
      expect(created.role).toBe(role);
    });

    it.each([UserRole.ADMIN, UserRole.MANAGER, UserRole.CUSTOMER])(
      'should reject creating a %s user with FORBIDDEN and not touch the repo',
      async (role) => {
        await expect(useCase.execute(manager, baseCommand(role))).rejects.toBeInstanceOf(
          UserCreationForbiddenError,
        );
        expect(repo.created).toHaveLength(0);
        expect(hasher.hashed).toHaveLength(0);
      },
    );
  });
});
