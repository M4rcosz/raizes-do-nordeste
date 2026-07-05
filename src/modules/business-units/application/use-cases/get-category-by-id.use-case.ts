import { Inject, Injectable } from '@nestjs/common';
import { Category } from '../../domain/entities/category.entity';
import { CategoriesFetchError } from '../errors/category-fetch.error';
import { CategoryNotFoundError } from '../../domain/errors/category-not-found.error';
import {
  CATEGORY_REPOSITORY,
  type CategoryRepository,
} from '../../domain/repositories/category.repository';

@Injectable()
export class GetCategoryByIdUseCase {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepository,
  ) {}

  async execute(categoryId: string): Promise<Category> {
    let category: Category | null;

    try {
      category = await this.categories.findById(categoryId);
    } catch (err) {
      throw new CategoriesFetchError(`Could not retrieve category by id "${categoryId}".`, {
        cause: err,
      });
    }

    if (!category) {
      throw new CategoryNotFoundError(`Category with id "${categoryId}" not found.`);
    }

    return category;
  }
}
