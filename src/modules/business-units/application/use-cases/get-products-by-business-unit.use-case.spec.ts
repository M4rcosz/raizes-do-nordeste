import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import Big from 'big.js';
import { GetProductsByBusinessUnitUseCase } from './get-products-by-business-unit.use-case';
import {
  ProductRepository,
  PRODUCT_REPOSITORY,
} from '../../domain/repositories/product.repository';
import { Product } from '../../domain/entities/product.entity';
import { ProductsFetchError } from '../errors/product-fetch.error';

describe('GetProductsByBusinessUnitUseCase', () => {
  let useCase: GetProductsByBusinessUnitUseCase;
  let findAllByBusinessUnit: jest.MockedFunction<ProductRepository['findAllByBusinessUnit']>;

  const buildProduct = (id: string): Product =>
    new Product(
      id,
      `Product ${id}`,
      null,
      new Big('10.00'),
      true,
      'category-1',
      new Date(),
      new Date(),
      'example.com',
    );

  beforeAll(async () => {
    findAllByBusinessUnit = jest.fn() as jest.MockedFunction<
      ProductRepository['findAllByBusinessUnit']
    >;

    const mockRepo: jest.Mocked<ProductRepository> = {
      findAllActive: jest.fn(),
      findById: jest.fn(),
      findAllByBusinessUnit,
      create: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        GetProductsByBusinessUnitUseCase,
        { provide: PRODUCT_REPOSITORY, useValue: mockRepo },
      ],
    }).compile();

    useCase = moduleRef.get(GetProductsByBusinessUnitUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should forward businessUnitId, cursor, take = limit + 1 and filters', async () => {
      findAllByBusinessUnit.mockResolvedValue([]);

      await useCase.execute({
        businessUnitId: 'bu-1',
        limit: 5,
        cursor: 'last-id',
        filters: { search: 'juice' },
      });

      expect(findAllByBusinessUnit).toHaveBeenCalledWith({
        businessUnitId: 'bu-1',
        pagination: { cursor: 'last-id', take: 6 },
        filters: { search: 'juice' },
      });
    });

    it('should trim the extra item and expose nextCursor when there is a next page', async () => {
      findAllByBusinessUnit.mockResolvedValue([
        buildProduct('a'),
        buildProduct('b'),
        buildProduct('c'),
      ]);

      const result = await useCase.execute({ businessUnitId: 'bu-1', limit: 2 });

      expect(result.data.map((p) => p.id)).toEqual(['a', 'b']);
      expect(result.meta).toEqual({ limit: 2, hasMore: true, nextCursor: 'b' });
    });

    it('should return hasMore=false when fewer than limit + 1 items are returned', async () => {
      findAllByBusinessUnit.mockResolvedValue([buildProduct('a')]);

      const result = await useCase.execute({ businessUnitId: 'bu-1', limit: 20 });

      expect(result.meta).toEqual({ limit: 20, hasMore: false, nextCursor: null });
    });

    it('should throw ProductsFetchError wrapping the original error when the repository fails', async () => {
      const dbError = new Error('DB error');
      findAllByBusinessUnit.mockRejectedValue(dbError);

      await expect(useCase.execute({ businessUnitId: 'bu-1', limit: 20 })).rejects.toBeInstanceOf(
        ProductsFetchError,
      );
      await expect(useCase.execute({ businessUnitId: 'bu-1', limit: 20 })).rejects.toMatchObject({
        cause: dbError,
      });
    });
  });
});
