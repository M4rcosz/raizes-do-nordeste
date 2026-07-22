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
import { decodeUserCursor, encodeUserCursor } from '../user-keyset-cursor';

export interface ListUsersActor {
  role: UserRole;
  businessUnitIds: string[];
}

export interface ListUsersInput {
  actor: ListUsersActor;
  businessUnitId?: string;
  username?: string;
  email?: string;
  role?: UserRole;
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
    const { actor, businessUnitId, username, email, role, cursor, limit } = input;

    // Decode before the scope check so a malformed token is the caller's error (422)
    // rather than an empty page that reads as "no users in scope".
    const keyset = cursor === undefined ? undefined : decodeUserCursor(cursor);

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
    // Role is a plain AND filter, never a scope widener: a MANAGER asking for
    // role=CUSTOMER still gets the unit restriction, so it matches nobody
    // (customers hold no unit links). Reaching customers stays an ADMIN read.
    if (role !== undefined) {
      filters.role = role;
    }

    let items: User[];
    try {
      items = await this.users.findMany({
        filters,
        take: limit + 1,
        keyset,
      });
    } catch (err) {
      throw new UsersFetchError('Could not retrieve users.', { cause: err });
    }

    return buildCursorPage(items, limit, (user) => encodeUserCursor(user.createdAt, user.id));
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
