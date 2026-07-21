import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import type { User } from '@modules/identity/domain/entities/user.entity';
import type { UserDirectory, UserDirectoryEntry } from '../ports/user-directory.port';

@Injectable()
export class UserDirectoryService implements UserDirectory {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
  ) {}

  async findByIds(ids: string[]): Promise<UserDirectoryEntry[]> {
    // Deduplicate before querying: callers merge from several lists and may well
    // hand us the same id twice.
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return [];
    }
    const users = await this.users.findByIds(unique);
    return users.map((user) => UserDirectoryService.toEntry(user));
  }

  private static toEntry(user: User): UserDirectoryEntry {
    return { id: user.id, name: user.name, email: user.email };
  }
}
