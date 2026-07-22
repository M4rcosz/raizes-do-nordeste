import { Inject, Injectable } from '@nestjs/common';
import {
  type ProductRepository,
  PRODUCT_REPOSITORY,
  ProductFilters,
} from '../../domain/repositories/product.repository';
import { Product } from '../../domain/entities/product.entity';
import { ProductsFetchError } from '../errors/product-fetch.error';
import { CursorPaginatedResult, buildCursorPage } from '@shared/pagination/pagination';
import { decodeCatalogCursor, encodeCatalogCursor } from '../catalog-keyset-cursor';

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

    // Decode before the fetch: a malformed token is the caller's error (422), not a
    // repository failure, and must not surface as an outage.
    const keyset = cursor === undefined ? undefined : decodeCatalogCursor(cursor);

    let items: Product[];
    try {
      items = await this.products.findAllByBusinessUnit({
        businessUnitId,
        take: limit + 1,
        keyset,
        filters,
      });
    } catch (err) {
      throw new ProductsFetchError(
        `Could not retrieve products for business unit "${businessUnitId}".`,
        { cause: err },
      );
    }

    // The token carries the whole sort key, so the next page rebuilds the keyset
    // predicate without re-reading the row it points at.
    return buildCursorPage(items, limit, (product) =>
      encodeCatalogCursor(product.createdAt, product.id),
    );
  }
}
