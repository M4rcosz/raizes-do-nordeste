import { beforeEach, describe, expect, it } from '@jest/globals';
import { User } from '@modules/identity/domain/entities/user.entity';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import type {
  FindUsersInput,
  UserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import { UserForAiService } from './user-for-ai.service';
import type { UserAiActor } from '../ports/user-for-ai.port';

function user(id: string): User {
  return new User(
    id,
    ['bu-1'],
    `user${id}`,
    'Ana Souza',
    'ana@example.com',
    'argon2-hash',
    '81999999999',
    new Date(),
    new Date(),
    null,
    UserRole.MANAGER,
    true,
  );
}

class RecordingUserRepository implements Pick<UserRepository, 'findMany'> {
  lastInput?: FindUsersInput;
  rows: User[] = [];

  findMany(input: FindUsersInput): Promise<User[]> {
    this.lastInput = input;
    return Promise.resolve(this.rows);
  }
}

const admin: UserAiActor = { userId: 'admin-1', role: UserRole.ADMIN, businessUnitIds: [] };
const manager: UserAiActor = {
  userId: 'manager-1',
  role: UserRole.MANAGER,
  businessUnitIds: ['bu-1'],
};

describe('UserForAiService.listForActor', () => {
  let repo: RecordingUserRepository;
  let service: UserForAiService;

  beforeEach(() => {
    repo = new RecordingUserRepository();
    service = new UserForAiService(repo as unknown as UserRepository);
  });

  describe('admin gate', () => {
    it('lists for an admin', async () => {
      repo.rows = [user('u-1')];

      const result = await service.listForActor({}, admin);

      expect(result.users).toHaveLength(1);
    });

    it.each([UserRole.MANAGER, UserRole.ATTENDANT, UserRole.KITCHEN, UserRole.CUSTOMER])(
      'returns empty for %s without querying',
      async (role) => {
        // Second gate: the tool registry declares and dispatches listUsers for ADMIN
        // only, but a registry mistake must not become a user listing.
        const result = await service.listForActor({}, { ...manager, role });

        expect(result).toEqual({ users: [], hasMore: false });
        expect(repo.lastInput).toBeUndefined();
      },
    );
  });

  describe('projection', () => {
    it('never exposes contact details or the password hash', async () => {
      repo.rows = [user('u-1')];

      const [view] = (await service.listForActor({}, admin)).users;

      expect(view).toEqual({
        id: 'u-1',
        username: 'useru-1',
        name: 'Ana Souza',
        role: UserRole.MANAGER,
        isActive: true,
        businessUnitIds: ['bu-1'],
      });
      // Explicit: this data crosses into a third-party model and back into stored
      // chat text, so the absence of these keys is the point of the view.
      expect(view).not.toHaveProperty('email');
      expect(view).not.toHaveProperty('phone');
      expect(view).not.toHaveProperty('passwordHash');
    });
  });

  describe('filters', () => {
    it('passes the username through and wraps a unit id into the repo array shape', async () => {
      await service.listForActor({ username: 'ana', businessUnitId: 'bu-2' }, admin);

      expect(repo.lastInput?.filters).toEqual({
        username: 'ana',
        businessUnitIds: ['bu-2'],
      });
    });

    it('leaves businessUnitIds undefined when no unit was asked for', async () => {
      await service.listForActor({}, admin);

      expect(repo.lastInput?.filters?.businessUnitIds).toBeUndefined();
    });
  });

  it('over-fetches by one and reports hasMore without leaking the probe row', async () => {
    repo.rows = Array.from({ length: 11 }, (_, i) => user(`u-${i}`));

    const result = await service.listForActor({}, admin);

    expect(repo.lastInput?.take).toBe(11);
    expect(result.users).toHaveLength(10);
    expect(result.hasMore).toBe(true);
  });
});
