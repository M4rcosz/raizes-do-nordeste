import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import Big from 'big.js';
import {
  type CreateProductInput,
  IProductRepository,
  PRODUCT_REPOSITORY,
} from '../../domain/repositories/product.repository';
import { CreateProductUseCase } from './create-product.use-case';
import { Product } from '../../domain/entities/product.entity';
import { ProductAlreadyExistsError } from '../../domain/errors/product-already-exists.error';

describe('CreateProductUseCase', () => {
  let useCase: CreateProductUseCase;
  let create: jest.MockedFunction<IProductRepository['create']>;

  const input: CreateProductInput = {
    name: 'Acarajé',
    description: 'Feijão-fradinho cake',
    price: '12.50',
    categoryId: 'category-1',
    imageUrl: 'https://example.com/acaraje.jpg',
  };

  beforeAll(async () => {
    create = jest.fn() as jest.MockedFunction<IProductRepository['create']>;

    const mockRepo: jest.Mocked<IProductRepository> = {
      findAllActive: jest.fn(),
      findById: jest.fn(),
      findAllByBusinessUnit: jest.fn(),
      create,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [CreateProductUseCase, { provide: PRODUCT_REPOSITORY, useValue: mockRepo }],
    }).compile();

    useCase = moduleRef.get(CreateProductUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should delegate to the repository and return the created product', async () => {
      const created = new Product(
        'uuid-1',
        input.name,
        input.description ?? null,
        new Big(input.price),
        true,
        input.categoryId,
        new Date(),
        new Date(),
        input.imageUrl,
      );
      create.mockResolvedValue(created);

      const result = await useCase.execute(input);

      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith(input);
      expect(result).toBe(created);
    });

    it('should propagate domain errors raised by the repository', async () => {
      const domainError = new ProductAlreadyExistsError(
        'A product named "Acarajé" already exists.',
      );
      create.mockRejectedValue(domainError);

      await expect(useCase.execute(input)).rejects.toBe(domainError);
    });
  });
});
