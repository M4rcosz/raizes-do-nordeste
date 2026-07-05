import { beforeEach, describe, expect, it } from '@jest/globals';
import { GetCategoryByIdUseCase } from './get-category-by-id.use-case';
import { Category } from '../../domain/entities/category.entity';
import {
  CreateCategoryInput,
  FindCategoriesInput,
  CategoryRepository,
} from '../../domain/repositories/category.repository';
import { CategoriesFetchError } from '../errors/category-fetch.error';
import { CategoryNotFoundError } from '../../domain/errors/category-not-found.error';

// In-memory fake. findById returns any seeded category regardless of isActive,
// mirroring the product get-by-id behavior (no active-only filter).
class FakeCategoryRepository implements CategoryRepository {
  readonly store = new Map<string, Category>();
  shouldThrow = false;

  seed(category: Category): void {
    this.store.set(category.id, category);
  }

  findById(id: string): Promise<Category | null> {
    if (this.shouldThrow) {
      return Promise.reject(new Error('DB error'));
    }
    return Promise.resolve(this.store.get(id) ?? null);
  }

  findAllActive(_input: FindCategoriesInput): Promise<Category[]> {
    return Promise.reject(new Error('not used'));
  }

  create(_input: CreateCategoryInput): Promise<Category> {
    return Promise.reject(new Error('not used'));
  }

  update(_category: Category): Promise<Category | null> {
    return Promise.reject(new Error('not used'));
  }
}

describe('GetCategoryByIdUseCase', () => {
  let repo: FakeCategoryRepository;
  let useCase: GetCategoryByIdUseCase;

  beforeEach(() => {
    repo = new FakeCategoryRepository();
    useCase = new GetCategoryByIdUseCase(repo);
  });

  it('returns the category when it exists', async () => {
    const category = new Category('uuid-1', 'Bebidas', null, true, new Date(), new Date());
    repo.seed(category);

    const result = await useCase.execute('uuid-1');

    expect(result).toBe(category);
  });

  it('returns an inactive category too (no active-only filter)', async () => {
    const category = new Category('uuid-1', 'Bebidas', null, false, new Date(), new Date());
    repo.seed(category);

    const result = await useCase.execute('uuid-1');

    expect(result.isActive).toBe(false);
  });

  it('throws CategoryNotFoundError when the category does not exist', async () => {
    await expect(useCase.execute('missing-id')).rejects.toBeInstanceOf(CategoryNotFoundError);
  });

  it('throws CategoriesFetchError wrapping the original error when the repository fails', async () => {
    repo.shouldThrow = true;

    await expect(useCase.execute('uuid-1')).rejects.toBeInstanceOf(CategoriesFetchError);
  });
});
