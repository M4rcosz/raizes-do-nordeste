import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Money } from '@shared/domain/value-objects/money';
import {
  ProductRepository,
  PRODUCT_REPOSITORY,
} from '../../domain/repositories/product.repository';
import { GetActiveProductsUseCase } from './get-active-products.use-case';
import { ProductsFetchError } from '../errors/product-fetch.error';
import { Product } from '../../domain/entities/product.entity';
import { encodeCatalogCursor } from '../catalog-keyset-cursor';

// Fixed so the expected page token is computable: the token is derived from the
// row's createdAt, not from its id.
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
const CURSOR = encodeCatalogCursor(CREATED_AT, 'last-id');

describe('GetActiveProductsUseCase', () => {
  let useCase: GetActiveProductsUseCase;
  let findAllActive: jest.MockedFunction<ProductRepository['findAllActive']>;

  const buildProduct = (id: string): Product =>
    new Product(
      id,
      `Product ${id}`,
      null,
      Money.fromDecimalString('10.00'),
      true,
      'category-1',
      CREATED_AT,
      CREATED_AT,
      'example.com',
    );

  beforeAll(async () => {
    findAllActive = jest.fn() as jest.MockedFunction<ProductRepository['findAllActive']>;

    const mockRepo: jest.Mocked<ProductRepository> = {
      findAllActive,
      findById: jest.fn(),
      findAllByBusinessUnit: jest.fn(),
      create: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [GetActiveProductsUseCase, { provide: PRODUCT_REPOSITORY, useValue: mockRepo }],
    }).compile();

    useCase = moduleRef.get(GetActiveProductsUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should request limit + 1 from the repository to detect a next page', async () => {
      findAllActive.mockResolvedValue([]);

      await useCase.execute({ limit: 20 });

      expect(findAllActive).toHaveBeenCalledWith({
        take: 21,
        keyset: undefined,
        filters: undefined,
      });
    });

    it('should forward cursor and filters to the repository', async () => {
      findAllActive.mockResolvedValue([]);

      await useCase.execute({
        limit: 10,
        cursor: CURSOR,
        filters: { search: 'açaí', categoryId: 'cat-1' },
      });

      expect(findAllActive).toHaveBeenCalledWith({
        take: 11,
        keyset: { timestamp: CREATED_AT, id: 'last-id' },
        filters: { search: 'açaí', categoryId: 'cat-1' },
      });
    });

    it('should return data with hasMore=false and nextCursor=null when fewer than limit + 1 items are returned', async () => {
      findAllActive.mockResolvedValue([buildProduct('a'), buildProduct('b')]);

      const result = await useCase.execute({ limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ limit: 20, hasMore: false, nextCursor: null });
    });

    it('should trim the extra item and expose nextCursor when there is a next page', async () => {
      findAllActive.mockResolvedValue([buildProduct('a'), buildProduct('b'), buildProduct('c')]);

      const result = await useCase.execute({ limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.data.map((p) => p.id)).toEqual(['a', 'b']);
      expect(result.meta).toEqual({
        limit: 2,
        hasMore: true,
        nextCursor: encodeCatalogCursor(CREATED_AT, 'b'),
      });
    });

    it('should return an empty page when the repository returns no items', async () => {
      findAllActive.mockResolvedValue([]);

      const result = await useCase.execute({ limit: 20 });

      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({ limit: 20, hasMore: false, nextCursor: null });
    });

    it('should throw ProductsFetchError wrapping the original error when the repository fails', async () => {
      const dbError = new Error('DB error');
      findAllActive.mockRejectedValue(dbError);

      await expect(useCase.execute({ limit: 20 })).rejects.toBeInstanceOf(ProductsFetchError);
      await expect(useCase.execute({ limit: 20 })).rejects.toMatchObject({ cause: dbError });
    });
  });
});
