import { beforeEach, describe, expect, it } from '@jest/globals';
import { User } from '@modules/identity/domain/entities/user.entity';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import type { UserRepository } from '@modules/identity/domain/repositories/user.repository';
import { UserDirectoryService } from './user-directory.service';

function user(id: string, email: string | null = `${id}@example.com`): User {
  return new User(
    id,
    ['bu-1'],
    `user${id}`,
    'Ana Souza',
    email,
    'argon2-hash',
    '81999999999',
    new Date(),
    new Date(),
    null,
    UserRole.MANAGER,
    true,
  );
}

class RecordingUserRepository implements Pick<UserRepository, 'findByIds'> {
  calls: string[][] = [];
  rows: User[] = [];

  findByIds(ids: string[]): Promise<User[]> {
    this.calls.push(ids);
    return Promise.resolve(this.rows.filter((row) => ids.includes(row.id)));
  }
}

describe('UserDirectoryService.findByIds', () => {
  let users: RecordingUserRepository;
  let service: UserDirectoryService;

  beforeEach(() => {
    users = new RecordingUserRepository();
    service = new UserDirectoryService(users as unknown as UserRepository);
  });

  it('projects id, name and email', async () => {
    users.rows = [user('u-1')];

    const entries = await service.findByIds(['u-1']);

    expect(entries).toEqual([{ id: 'u-1', name: 'Ana Souza', email: 'u-1@example.com' }]);
  });

  it('keeps a missing email as null instead of dropping the user', async () => {
    users.rows = [user('u-1', null)];

    const entries = await service.findByIds(['u-1']);

    expect(entries).toEqual([{ id: 'u-1', name: 'Ana Souza', email: null }]);
  });

  it('resolves every id in a single batched call', async () => {
    users.rows = [user('u-1'), user('u-2')];

    const entries = await service.findByIds(['u-1', 'u-2']);

    expect(entries.map((e) => e.id)).toEqual(['u-1', 'u-2']);
    expect(users.calls).toHaveLength(1);
  });

  it('deduplicates repeated ids before querying', async () => {
    users.rows = [user('u-1')];

    await service.findByIds(['u-1', 'u-1']);

    expect(users.calls).toEqual([['u-1']]);
  });

  it('omits ids that resolve to nothing', async () => {
    users.rows = [user('u-1')];

    const entries = await service.findByIds(['u-1', 'ghost']);

    expect(entries.map((e) => e.id)).toEqual(['u-1']);
  });

  it('does not query at all for an empty id list', async () => {
    const entries = await service.findByIds([]);

    expect(entries).toEqual([]);
    expect(users.calls).toEqual([]);
  });
});
