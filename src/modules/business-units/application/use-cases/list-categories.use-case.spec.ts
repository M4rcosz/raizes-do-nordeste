import { beforeEach, describe, expect, it } from '@jest/globals';
import { ListCategoriesUseCase } from './list-categories.use-case';
import { Category } from '../../domain/entities/category.entity';
import {
  CreateCategoryInput,
  FindCategoriesInput,
  CategoryRepository,
} from '../../domain/repositories/category.repository';
import { CategoriesFetchError } from '../errors/category-fetch.error';

const buildCategory = (id: string): Category =>
  new Category(id, `Category ${id}`, null, true, new Date(), new Date());

// In-memory fake. findAllActive returns the queued page and records the input
// so the spec can assert the over-fetch (take = limit + 1) contract.
class FakeCategoryRepository implements CategoryRepository {
  page: Category[] = [];
  lastInput?: FindCategoriesInput;
  shouldThrow = false;

  findById(_id: string): Promise<Category | null> {
    return Promise.reject(new Error('not used'));
  }

  findAllActive(input: FindCategoriesInput): Promise<Category[]> {
    if (this.shouldThrow) {
      return Promise.reject(new Error('DB error'));
    }
    this.lastInput = input;
    return Promise.resolve(this.page);
  }

  create(_input: CreateCategoryInput): Promise<Category> {
    return Promise.reject(new Error('not used'));
  }

  update(_category: Category): Promise<Category | null> {
    return Promise.reject(new Error('not used'));
  }
}

describe('ListCategoriesUseCase', () => {
  let repo: FakeCategoryRepository;
  let useCase: ListCategoriesUseCase;

  beforeEach(() => {
    repo = new FakeCategoryRepository();
    useCase = new ListCategoriesUseCase(repo);
  });

  it('requests limit + 1 from the repository to detect a next page', async () => {
    repo.page = [];

    await useCase.execute({ limit: 20 });

    expect(repo.lastInput).toEqual({
      pagination: { cursor: undefined, take: 21 },
      filters: undefined,
    });
  });

  it('forwards cursor and filters to the repository', async () => {
    repo.page = [];

    await useCase.execute({ limit: 10, cursor: 'last-id', filters: { search: 'beb' } });

    expect(repo.lastInput).toEqual({
      pagination: { cursor: 'last-id', take: 11 },
      filters: { search: 'beb' },
    });
  });

  it('returns hasMore=false and nextCursor=null when fewer than limit + 1 items are returned', async () => {
    repo.page = [buildCategory('a'), buildCategory('b')];

    const result = await useCase.execute({ limit: 20 });

    expect(result.data).toHaveLength(2);
    expect(result.meta).toEqual({ limit: 20, hasMore: false, nextCursor: null });
  });

  it('trims the extra item and exposes nextCursor when there is a next page', async () => {
    repo.page = [buildCategory('a'), buildCategory('b'), buildCategory('c')];

    const result = await useCase.execute({ limit: 2 });

    expect(result.data.map((c) => c.id)).toEqual(['a', 'b']);
    expect(result.meta).toEqual({ limit: 2, hasMore: true, nextCursor: 'b' });
  });

  it('throws CategoriesFetchError wrapping the original error when the repository fails', async () => {
    repo.shouldThrow = true;

    await expect(useCase.execute({ limit: 20 })).rejects.toBeInstanceOf(CategoriesFetchError);
  });
});
