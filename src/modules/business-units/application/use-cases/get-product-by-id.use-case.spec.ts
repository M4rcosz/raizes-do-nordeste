import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import Big from 'big.js';
import {
  ProductRepository,
  PRODUCT_REPOSITORY,
} from '../../domain/repositories/product.repository';
import { GetProductByIdUseCase } from './get-product-by-id.use-case';
import { Product } from '../../domain/entities/product.entity';
import { ProductsFetchError } from '../errors/product-fetch.error';
import { ProductNotFoundError } from '../errors/product-not-found.error';

describe('GetProductByIdUseCase', () => {
  describe('execute', () => {
    let useCase: GetProductByIdUseCase;
    let findById: jest.MockedFunction<ProductRepository['findById']>;

    beforeAll(async () => {
      findById = jest.fn() as jest.MockedFunction<ProductRepository['findById']>;

      const mockRepo: jest.Mocked<ProductRepository> = {
        findAllActive: jest.fn(),
        findById,
        findAllByBusinessUnit: jest.fn(),
        create: jest.fn(),
      };

      const moduleRef = await Test.createTestingModule({
        providers: [
          GetProductByIdUseCase,
          {
            provide: PRODUCT_REPOSITORY,
            useValue: mockRepo,
          },
        ],
      }).compile();

      useCase = moduleRef.get(GetProductByIdUseCase);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should return the product when it exists', async () => {
      const mockProduct = new Product(
        'uuid-1',
        'Lemon Juice',
        null,
        new Big('7.99'),
        true,
        'uuid-category',
        new Date(),
        new Date(),
        'example.com',
      );

      findById.mockResolvedValue(mockProduct);

      const data = await useCase.execute('uuid-1');

      expect(findById).toHaveBeenCalledTimes(1);
      expect(findById).toHaveBeenCalledWith('uuid-1');
      expect(data).toBe(mockProduct);
    });

    it('should throw ProductNotFoundError when the product does not exist', async () => {
      findById.mockResolvedValue(null);

      await expect(useCase.execute('missing-id')).rejects.toBeInstanceOf(ProductNotFoundError);
    });

    it('should throw ProductsFetchError wrapping the original error when the repository fails', async () => {
      const dbError = new Error('DB error');
      findById.mockRejectedValue(dbError);

      await expect(useCase.execute('uuid-1')).rejects.toBeInstanceOf(ProductsFetchError);
      await expect(useCase.execute('uuid-1')).rejects.toMatchObject({ cause: dbError });
    });
  });
});
