import { beforeEach, describe, expect, it } from '@jest/globals';
import { ListCategoriesUseCase } from './list-categories.use-case';
import { Category } from '../../domain/entities/category.entity';
import {
  CreateCategoryInput,
  FindCategoriesInput,
  CategoryRepository,
} from '../../domain/repositories/category.repository';
import { CategoriesFetchError } from '../errors/category-fetch.error';
import { encodeCatalogCursor } from '../catalog-keyset-cursor';

// Fixed so the expected page token is computable: the token is derived from the
// row's createdAt, not from its id.
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
const CURSOR = encodeCatalogCursor(CREATED_AT, 'last-id');

const buildCategory = (id: string): Category =>
  new Category(id, `Category ${id}`, null, true, CREATED_AT, CREATED_AT);

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
      take: 21,
      keyset: undefined,
      filters: undefined,
    });
  });

  it('forwards cursor and filters to the repository', async () => {
    repo.page = [];

    await useCase.execute({ limit: 10, cursor: CURSOR, filters: { search: 'beb' } });

    expect(repo.lastInput).toEqual({
      take: 11,
      keyset: { timestamp: CREATED_AT, id: 'last-id' },
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
    expect(result.meta).toEqual({
      limit: 2,
      hasMore: true,
      nextCursor: encodeCatalogCursor(CREATED_AT, 'b'),
    });
  });

  it('throws CategoriesFetchError wrapping the original error when the repository fails', async () => {
    repo.shouldThrow = true;

    await expect(useCase.execute({ limit: 20 })).rejects.toBeInstanceOf(CategoriesFetchError);
  });
});
