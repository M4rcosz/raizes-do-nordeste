import { Inject, Injectable } from '@nestjs/common';
import { BusinessUnitScopeError } from '@shared/errors/application/business-unit-scope.error';
import {
  buildCursorMeta,
  buildCursorPage,
  type CursorPaginatedResult,
} from '@shared/pagination/pagination';
import { User } from '@modules/identity/domain/entities/user.entity';
import {
  type ListUsersFilters,
  USER_REPOSITORY,
  type UserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { UsersFetchError } from '../errors/users-fetch.error';

export interface ListUsersActor {
  role: UserRole;
  businessUnitIds: string[];
}

export interface ListUsersInput {
  actor: ListUsersActor;
  businessUnitId?: string;
  username?: string;
  email?: string;
  cursor?: string;
  limit: number;
}

@Injectable()
export class ListUsersUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
  ) {}

  // @Roles gates ADMIN/MANAGER at the controller. The MANAGER scope is FORCED to
  // the claim here (UnitScopeGuard does not cover query params), so a MANAGER can
  // never read users outside their units. A businessUnitId outside the claim
  // reads as not-found (anti-IDOR), never as an empty list that leaks the unit.
  async execute(input: ListUsersInput): Promise<CursorPaginatedResult<User>> {
    const { actor, businessUnitId, username, email, cursor, limit } = input;

    const scope = this.resolveScope(actor, businessUnitId);

    // A MANAGER whose effective scope is empty (no units, or the resolver pinned
    // to none) can match nothing. Short-circuit instead of issuing an unfiltered
    // query that would leak every user.
    if (scope.empty) {
      return { data: [], meta: buildCursorMeta(limit, false, undefined) };
    }

    const filters: ListUsersFilters = {};
    if (scope.businessUnitIds !== undefined) {
      filters.businessUnitIds = scope.businessUnitIds;
    }
    if (username !== undefined) {
      filters.username = username;
    }
    if (email !== undefined) {
      filters.email = email;
    }

    let items: User[];
    try {
      items = await this.users.findMany({
        filters,
        pagination: { cursor, take: limit + 1 },
      });
    } catch (err) {
      throw new UsersFetchError('Could not retrieve users.', { cause: err });
    }

    return buildCursorPage(items, limit);
  }

  // ADMIN: free businessUnitId filter, or none (all units). MANAGER: pinned to
  // the claim. Returns `empty` when a MANAGER has nothing in reach.
  private resolveScope(
    actor: ListUsersActor,
    requested?: string,
  ): { businessUnitIds?: string[]; empty: boolean } {
    if (actor.role === UserRole.ADMIN) {
      return { businessUnitIds: requested !== undefined ? [requested] : undefined, empty: false };
    }

    // MANAGER (the only other role the controller admits).
    if (requested !== undefined) {
      if (!actor.businessUnitIds.includes(requested)) {
        throw new BusinessUnitScopeError();
      }
      return { businessUnitIds: [requested], empty: false };
    }

    return { businessUnitIds: actor.businessUnitIds, empty: actor.businessUnitIds.length === 0 };
  }
}
