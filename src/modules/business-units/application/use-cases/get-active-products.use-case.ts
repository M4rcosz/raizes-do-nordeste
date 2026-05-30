import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_REPOSITORY,
  ProductFilters,
  type ProductRepository,
} from '../../domain/repositories/product.repository';
import { ProductsFetchError } from '../errors/product-fetch.error';
import { Product } from '../../domain/entities/product.entity';
import { CursorPaginatedResult, buildCursorMeta } from '@shared/pagination/pagination';

export interface GetActiveProductsInput {
  cursor?: string;
  limit: number;
  filters?: ProductFilters;
}

@Injectable()
export class GetActiveProductsUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepository,
  ) {}

  async execute(input: GetActiveProductsInput): Promise<CursorPaginatedResult<Product>> {
    const { cursor, limit, filters } = input;

    let items: Product[];
    try {
      items = await this.products.findAllActive({
        pagination: { cursor, take: limit + 1 },
        filters,
      });
    } catch (err) {
      throw new ProductsFetchError('Could not retrieve active products.', { cause: err });
    }

    const hasMore = items.length > limit;
    const trimmed = hasMore ? items.slice(0, limit) : items;
    const lastItemId = trimmed[trimmed.length - 1]?.id;

    return {
      data: trimmed,
      meta: buildCursorMeta(limit, hasMore, lastItemId),
    };
  }
}
