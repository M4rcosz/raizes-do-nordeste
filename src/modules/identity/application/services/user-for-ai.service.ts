import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import type { User } from '@modules/identity/domain/entities/user.entity';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { buildCursorPage } from '@shared/pagination/pagination';
import type {
  UserAiActor,
  UserForAi,
  UserForAiView,
  UserListForAiFilters,
  UserListForAiResult,
} from '../ports/user-for-ai.port';

// Rows one AI listing may return. Small on purpose: every row is tokens metered
// against the caller's AI balance.
const AI_PAGE_SIZE = 10;

@Injectable()
export class UserForAiService implements UserForAi {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
  ) {}

  async listForActor(
    filters: UserListForAiFilters,
    actor: UserAiActor,
  ): Promise<UserListForAiResult> {
    // Second gate. The tool registry already declares and dispatches this tool for
    // ADMIN only; refusing here too means a registry mistake cannot turn into a user
    // listing for staff.
    if (actor.role !== UserRole.ADMIN) {
      return { users: [], hasMore: false };
    }

    // Fetch one extra row to know whether another page exists.
    const items = await this.users.findMany({
      filters: {
        username: filters.username,
        businessUnitIds: filters.businessUnitId ? [filters.businessUnitId] : undefined,
      },
      take: AI_PAGE_SIZE + 1,
    });
    const page = buildCursorPage(items, AI_PAGE_SIZE);
    return {
      users: page.data.map((user) => UserForAiService.toView(user)),
      hasMore: page.meta.hasMore,
    };
  }

  private static toView(user: User): UserForAiView {
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      businessUnitIds: user.businessUnitIds,
    };
  }
}
