import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_REPOSITORY,
  ProductFilters,
  type ProductRepository,
} from '../../domain/repositories/product.repository';
import { ProductsFetchError } from '../errors/product-fetch.error';
import { Product } from '../../domain/entities/product.entity';
import { CursorPaginatedResult, buildCursorPage } from '@shared/pagination/pagination';
import { decodeCatalogCursor, encodeCatalogCursor } from '../catalog-keyset-cursor';

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

    // Decode before the fetch: a malformed token is the caller's error (422), not a
    // repository failure, and must not surface as an outage.
    const keyset = cursor === undefined ? undefined : decodeCatalogCursor(cursor);

    let items: Product[];
    try {
      items = await this.products.findAllActive({
        take: limit + 1,
        keyset,
        filters,
      });
    } catch (err) {
      throw new ProductsFetchError('Could not retrieve active products.', { cause: err });
    }

    // The token carries the whole sort key, so the next page rebuilds the keyset
    // predicate without re-reading the row it points at.
    return buildCursorPage(items, limit, (product) =>
      encodeCatalogCursor(product.createdAt, product.id),
    );
  }
}
