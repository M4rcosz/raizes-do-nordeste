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
      new Date(),
      new Date(),
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
        pagination: { cursor: undefined, take: 21 },
        filters: undefined,
      });
    });

    it('should forward cursor and filters to the repository', async () => {
      findAllActive.mockResolvedValue([]);

      await useCase.execute({
        limit: 10,
        cursor: 'last-id',
        filters: { search: 'açaí', categoryId: 'cat-1' },
      });

      expect(findAllActive).toHaveBeenCalledWith({
        pagination: { cursor: 'last-id', take: 11 },
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
      expect(result.meta).toEqual({ limit: 2, hasMore: true, nextCursor: 'b' });
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
