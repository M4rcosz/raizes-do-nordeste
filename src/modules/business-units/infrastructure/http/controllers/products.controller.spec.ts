import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import Big from 'big.js';
import { ProductsController } from './products.controller';
import { GetActiveProductsUseCase } from '../../../application/use-cases/get-active-products.use-case';
import { GetProductsByBusinessUnitUseCase } from '../../../application/use-cases/get-products-by-business-unit.use-case';
import { GetProductByIdUseCase } from '../../../application/use-cases/get-product-by-id.use-case';
import { Product } from '../../../domain/entities/product.entity';
import { ProductResponseDto } from '../dto/product-response.dto';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { CreateProductUseCase } from '@modules/business-units/application/use-cases/create-product.use-case';
import { ProductNotFoundError } from '../../../application/errors/product-not-found.error';
import { ProductCreateDto } from '../dto/product-create.dto';

describe('ProductsController', () => {
  let controller: ProductsController;
  let getActiveProducts: jest.Mocked<GetActiveProductsUseCase>;
  let getProductsByBusinessUnit: jest.Mocked<GetProductsByBusinessUnitUseCase>;
  let getProductById: jest.Mocked<GetProductByIdUseCase>;
  let createProduct: jest.Mocked<CreateProductUseCase>;

  const buildProduct = (id = 'uuid-1'): Product =>
    new Product(
      id,
      'Açaí',
      null,
      new Big('12.50'),
      true,
      'category-uuid-1',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
      'example.com',
    );

  beforeAll(async () => {
    getActiveProducts = { execute: jest.fn() } as unknown as jest.Mocked<GetActiveProductsUseCase>;
    getProductsByBusinessUnit = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetProductsByBusinessUnitUseCase>;
    getProductById = { execute: jest.fn() } as unknown as jest.Mocked<GetProductByIdUseCase>;
    createProduct = { execute: jest.fn() } as unknown as jest.Mocked<CreateProductUseCase>;

    const moduleRef = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: GetActiveProductsUseCase, useValue: getActiveProducts },
        { provide: GetProductsByBusinessUnitUseCase, useValue: getProductsByBusinessUnit },
        { provide: GetProductByIdUseCase, useValue: getProductById },
        { provide: CreateProductUseCase, useValue: createProduct },
      ],
    }).compile();

    controller = moduleRef.get(ProductsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findActive', () => {
    it('should return a paginated DTO envelope with mapped items', async () => {
      getActiveProducts.execute.mockResolvedValue({
        data: [buildProduct()],
        meta: { limit: 20, hasMore: false, nextCursor: null },
      });

      const response = await controller.findActive({ limit: 20 });

      expect(response).toBeInstanceOf(PaginatedResponseDto);
      expect(response.data).toHaveLength(1);
      expect(response.data[0]).toBeInstanceOf(ProductResponseDto);
      expect(response.meta).toEqual({ limit: 20, hasMore: false, nextCursor: null });
    });

    it('should clamp out-of-range limits to MAX_LIMIT', async () => {
      getActiveProducts.execute.mockResolvedValue({
        data: [],
        meta: { limit: 100, hasMore: false, nextCursor: null },
      });

      await controller.findActive({ limit: 99999 });

      expect(getActiveProducts.execute).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
      );
    });

    it('should pass cursor and filters through to the use-case', async () => {
      getActiveProducts.execute.mockResolvedValue({
        data: [],
        meta: { limit: 20, hasMore: false, nextCursor: null },
      });

      await controller.findActive({
        limit: 20,
        cursor: 'cursor-id',
        search: 'açaí',
        categoryId: 'cat-1',
      });

      expect(getActiveProducts.execute).toHaveBeenCalledWith({
        cursor: 'cursor-id',
        limit: 20,
        filters: { search: 'açaí', categoryId: 'cat-1' },
      });
    });

    it('should pass undefined filters when neither search nor categoryId are provided', async () => {
      getActiveProducts.execute.mockResolvedValue({
        data: [],
        meta: { limit: 20, hasMore: false, nextCursor: null },
      });

      await controller.findActive({ limit: 20 });

      expect(getActiveProducts.execute).toHaveBeenCalledWith({
        cursor: undefined,
        limit: 20,
        filters: undefined,
      });
    });
  });

  describe('findByBusinessUnit', () => {
    it('should forward params and return a paginated DTO envelope', async () => {
      getProductsByBusinessUnit.execute.mockResolvedValue({
        data: [buildProduct()],
        meta: { limit: 20, hasMore: false, nextCursor: null },
      });

      const response = await controller.findByBusinessUnit(
        { businessUnitId: 'bu-id' },
        { limit: 20 },
      );

      expect(getProductsByBusinessUnit.execute).toHaveBeenCalledWith({
        businessUnitId: 'bu-id',
        cursor: undefined,
        limit: 20,
        filters: undefined,
      });
      expect(response).toBeInstanceOf(PaginatedResponseDto);
      expect(response.data[0]).toBeInstanceOf(ProductResponseDto);
    });
  });

  describe('findById', () => {
    it('should return the mapped DTO when the product exists', async () => {
      getProductById.execute.mockResolvedValue(buildProduct('uuid-42'));

      const response = await controller.findById({ productId: 'uuid-42' });

      expect(getProductById.execute).toHaveBeenCalledWith('uuid-42');
      expect(response).toBeInstanceOf(ProductResponseDto);
      expect(response.id).toBe('uuid-42');
    });

    it('should propagate ProductNotFoundError raised by the use-case', async () => {
      getProductById.execute.mockRejectedValue(new ProductNotFoundError('Product not found.'));

      await expect(controller.findById({ productId: 'missing' })).rejects.toBeInstanceOf(
        ProductNotFoundError,
      );
    });
  });

  describe('create', () => {
    it('should map the created product to its response DTO', async () => {
      const product = buildProduct('uuid-43');
      createProduct.execute.mockResolvedValue(product);

      const body: ProductCreateDto = {
        name: product.name,
        price: product.price.toString(),
        categoryId: product.categoryId,
        imageUrl: product.imageUrl,
      };

      const response = await controller.create(body);

      expect(createProduct.execute).toHaveBeenCalledWith(body);
      expect(response).toBeInstanceOf(ProductResponseDto);
      expect(response.id).toBe('uuid-43');
      expect(response.price).toBe(12.5);
    });
  });
});
