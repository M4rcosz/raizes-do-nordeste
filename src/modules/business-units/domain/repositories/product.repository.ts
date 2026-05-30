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
}

export const PRODUCT_REPOSITORY = Symbol('ProductRepository');
