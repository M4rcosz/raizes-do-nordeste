import { Inject, Injectable } from '@nestjs/common';
import {
  CATEGORY_REPOSITORY,
  CategoryFilters,
  type CategoryRepository,
} from '../../domain/repositories/category.repository';
import { CategoriesFetchError } from '../errors/category-fetch.error';
import { Category } from '../../domain/entities/category.entity';
import { CursorPaginatedResult, buildCursorMeta } from '@shared/pagination/pagination';

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

    let items: Category[];
    try {
      items = await this.categories.findAllActive({
        pagination: { cursor, take: limit + 1 },
        filters,
      });
    } catch (err) {
      throw new CategoriesFetchError('Could not retrieve active categories.', { cause: err });
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
