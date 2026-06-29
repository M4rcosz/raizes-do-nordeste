import type { CursorPaginationParams } from '@shared/pagination/pagination';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { User } from '../entities/user.entity';
import { UserRole } from '../value-objects/user-role';

/**
 * Flat data the repository persists for a new user. The domain factory
 * ({@link User.register}) produces these values (id, timestamps, hash already set);
 * the repo is dumb and just writes them. businessUnitIds become rows in the
 * user_business_units join table.
 */
export interface CreateUserInput {
  id: string;
  businessUnitIds: string[];
  username: string;
  name: string;
  email: string | null;
  passwordHash: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Fields that updateProfile may change. At least one must differ from current. */
export interface UpdateProfileInput {
  name?: string;
  phone?: string;
}

/** Optional, AND-combined filters for the staff listing. */
export interface ListUsersFilters {
  /** Restrict to users linked to ANY of these units (join EXISTS). */
  businessUnitIds?: string[];
  /** Case-insensitive substring match on username. */
  username?: string;
  /** Case-insensitive substring match on email. */
  email?: string;
}

export interface FindUsersInput {
  filters?: ListUsersFilters;
  pagination: CursorPaginationParams;
}

export interface UserRepository {
  findByUsername(username: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  /**
   * Conditional deactivation: flips is_active to false only if the row still has
   * `expectedRole` and is currently active. This closes the read-then-authorize
   * window so authorization decided on a stale role cannot apply to a changed one.
   * Returns the deactivated user, or null when no row matched the guard (role
   * changed under us, or already inactive). `updatedById` records who performed it.
   */
  deactivateIfRole(
    id: string,
    expectedRole: UserRole,
    updatedById: string | null,
  ): Promise<User | null>;
  /**
   * Conditional reactivation: flips is_active to true only if the row still has
   * `expectedRole` and is currently inactive. Symmetric to deactivateIfRole.
   * Returns the reactivated user, or null when no row matched the guard.
   */
  reactivateIfRole(
    id: string,
    expectedRole: UserRole,
    updatedById: string | null,
  ): Promise<User | null>;
  /**
   * Updates name and/or phone for the given user id. Returns the updated user,
   * or null if no row matched (user deleted between read and write).
   * Throws UserAlreadyExistsError on a phone unique collision (P2002).
   */
  updateProfile(id: string, data: UpdateProfileInput, updatedById: string): Promise<User | null>;
  /**
   * Replaces the password hash for the given user id, recording who changed it.
   * `tx` lets it share the caller's atomic unit (hash rotation + token revoke).
   * Returns the updated user, or null if no row matched (deleted between read and write).
   */
  updatePasswordHash(
    id: string,
    newPasswordHash: string,
    updatedById: string,
    tx?: TransactionContext,
  ): Promise<User | null>;
  /**
   * Cursor-paginated staff listing. Filters are AND-combined; businessUnitIds
   * matches users linked to any of the given units. Ordered by (createdAt desc,
   * id desc) so the cursor is stable.
   */
  findMany(input: FindUsersInput): Promise<User[]>;
  /**
   * Replaces a user's unit links with exactly `businessUnitIds` (delete current +
   * insert new), stamping `updatedById`. Runs inside the caller's `tx` so the swap
   * is atomic. Throws InvalidBusinessUnitError if any unit id does not exist (FK).
   * Returns the updated user with its new links, or null if the user is gone.
   */
  replaceBusinessUnits(
    id: string,
    businessUnitIds: string[],
    updatedById: string,
    tx: TransactionContext,
  ): Promise<User | null>;
}

export const USER_REPOSITORY = Symbol('UserRepository');
