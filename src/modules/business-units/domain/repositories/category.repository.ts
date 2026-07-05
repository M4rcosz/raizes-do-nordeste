import { Category } from '../entities/category.entity';
import { CursorPaginationParams } from '@shared/pagination/pagination';

/**
 * Query filters for listing categories. All fields are optional.
 * `search` performs a case-insensitive substring match on `name`.
 */
export interface CategoryFilters {
  search?: string;
}

export interface FindCategoriesInput {
  pagination: CursorPaginationParams;
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
