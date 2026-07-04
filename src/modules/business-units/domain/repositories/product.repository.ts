import { Product } from '../entities/product.entity';
import { CursorPaginationParams } from '@shared/pagination/pagination';

/**
 * Query filters for listing products. All fields are optional.
 * `search` performs a case-insensitive substring match on `name`.
 */
export interface ProductFilters {
  search?: string;
  categoryId?: string;
}

export interface FindProductsInput {
  pagination: CursorPaginationParams;
  filters?: ProductFilters;
}

export interface FindProductsByBusinessUnitInput extends FindProductsInput {
  businessUnitId: string;
}

export interface CreateProductInput {
  name: string;
  description?: string | null;
  price: string;
  categoryId: string;
  imageUrl: string;
}

export interface ProductRepository {
  findById(id: string): Promise<Product | null>;
  /**
   * Lists products available for a business unit, filtered and cursor-paginated.
   * Each product's `price` reflects the unit's `customPrice` when set,
   * falling back to the product's base price otherwise.
   */
  findAllByBusinessUnit(input: FindProductsByBusinessUnitInput): Promise<Product[]>;
  findAllActive(input: FindProductsInput): Promise<Product[]>;
  create(input: CreateProductInput): Promise<Product>;
  /**
   * Persists the editable fields of an already-built Product (domain-first
   * contract). Only catalog attributes are written (name, description, price,
   * categoryId, imageUrl); isActive and timestamps are left to their own paths.
   * Returns null when no product matches the id so the use case can raise a
   * not-found.
   */
  update(product: Product): Promise<Product | null>;
  /**
   * Flips the active flag. Idempotent by design: setting the value it already
   * holds is a no-op write that still returns the product. Returns null when no
   * product matches the id so the use case can raise a not-found.
   */
  setActive(id: string, isActive: boolean): Promise<Product | null>;
}

export const PRODUCT_REPOSITORY = Symbol('ProductRepository');
