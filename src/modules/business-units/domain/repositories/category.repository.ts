import { Category } from '../entities/category.entity';
import type { TimestampKeyset } from '@shared/pagination/keyset-cursor';

/**
 * Query filters for listing categories. All fields are optional.
 * `search` performs a case-insensitive substring match on `name`.
 */
export interface CategoryFilters {
  search?: string;
}

/**
 * Deliberately NOT CursorPaginationParams: `keyset` is the sort key of the previous
 * page's last row, not a row id to seek to. The WHERE here is built from toggleable
 * flags, so the row a positional cursor names can stop matching between two requests
 * and `skip: 1` would then drop the following row. Here the keyset timestamp is
 * createdAt.
 */
export interface FindCategoriesInput {
  take: number;
  keyset?: TimestampKeyset;
  filters?: CategoryFilters;
}

export interface CreateCategoryInput {
  name: string;
  description?: string | null;
}

export interface CategoryRepository {
  findById(id: string): Promise<Category | null>;
  /** Lists active categories, filtered and cursor-paginated. */
  findAllActive(input: FindCategoriesInput): Promise<Category[]>;
  create(input: CreateCategoryInput): Promise<Category>;
  /**
   * Persists the editable fields of an already-built Category (domain-first
   * contract): name, description and isActive; timestamps are left to their own
   * paths. Returns null when no category matches the id so the use case can
   * raise a not-found.
   */
  update(category: Category): Promise<Category | null>;
}

export const CATEGORY_REPOSITORY = Symbol('CategoryRepository');
