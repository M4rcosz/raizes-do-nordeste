import { Inject, Injectable } from '@nestjs/common';
import {
  CATEGORY_REPOSITORY,
  CategoryFilters,
  type CategoryRepository,
} from '../../domain/repositories/category.repository';
import { CategoriesFetchError } from '../errors/category-fetch.error';
import { Category } from '../../domain/entities/category.entity';
import { CursorPaginatedResult, buildCursorPage } from '@shared/pagination/pagination';
import { decodeCatalogCursor, encodeCatalogCursor } from '../catalog-keyset-cursor';

export interface ListCategoriesInput {
  cursor?: string;
  limit: number;
  filters?: CategoryFilters;
}

@Injectable()
export class ListCategoriesUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepository,
  ) {}

  async execute(input: ListCategoriesInput): Promise<CursorPaginatedResult<Category>> {
    const { cursor, limit, filters } = input;

    // Decode before the fetch: a malformed token is the caller's error (422), not a
    // repository failure, and must not surface as an outage.
    const keyset = cursor === undefined ? undefined : decodeCatalogCursor(cursor);

    let items: Category[];
    try {
      items = await this.categories.findAllActive({
        take: limit + 1,
        keyset,
        filters,
      });
    } catch (err) {
      throw new CategoriesFetchError('Could not retrieve active categories.', { cause: err });
    }

    // The token carries the whole sort key, so the next page rebuilds the keyset
    // predicate without re-reading the row it points at.
    return buildCursorPage(items, limit, (category) =>
      encodeCatalogCursor(category.createdAt, category.id),
    );
  }
}
