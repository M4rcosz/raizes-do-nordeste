import { Inject, Injectable } from '@nestjs/common';
import {
  type ProductRepository,
  PRODUCT_REPOSITORY,
  ProductFilters,
} from '../../domain/repositories/product.repository';
import { Product } from '../../domain/entities/product.entity';
import { ProductsFetchError } from '../errors/product-fetch.error';
import { CursorPaginatedResult, buildCursorMeta } from '@shared/pagination/pagination';

export interface GetProductsByBusinessUnitInput {
  businessUnitId: string;
  cursor?: string;
  limit: number;
  filters?: ProductFilters;
}

@Injectable()
export class GetProductsByBusinessUnitUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepository,
  ) {}

  async execute(input: GetProductsByBusinessUnitInput): Promise<CursorPaginatedResult<Product>> {
    const { businessUnitId, cursor, limit, filters } = input;

    let items: Product[];
    try {
      items = await this.products.findAllByBusinessUnit({
        businessUnitId,
        pagination: { cursor, take: limit + 1 },
        filters,
      });
    } catch (err) {
      throw new ProductsFetchError(
        `Could not retrieve products for business unit "${businessUnitId}".`,
        { cause: err },
      );
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
