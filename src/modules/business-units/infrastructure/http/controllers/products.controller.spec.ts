import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Money } from '@shared/domain/value-objects/money';
import { ProductsController } from './products.controller';
import { GetActiveProductsUseCase } from '../../../application/use-cases/get-active-products.use-case';
import { GetProductsByBusinessUnitUseCase } from '../../../application/use-cases/get-products-by-business-unit.use-case';
import { GetProductByIdUseCase } from '../../../application/use-cases/get-product-by-id.use-case';
import { Product } from '../../../domain/entities/product.entity';
import { ProductResponseDto } from '../dto/product-response.dto';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { CreateProductUseCase } from '@modules/business-units/application/use-cases/create-product.use-case';
import { SetProductActiveUseCase } from '@modules/business-units/application/use-cases/set-product-active.use-case';
import { UpdateProductUseCase } from '@modules/business-units/application/use-cases/update-product.use-case';
import { CreateProductImageUploadUrlUseCase } from '@modules/business-units/application/use-cases/create-product-image-upload-url.use-case';
import { ConfirmProductImageUploadUseCase } from '@modules/business-units/application/use-cases/confirm-product-image-upload.use-case';
import { ProductNotFoundError } from '../../../application/errors/product-not-found.error';
import { ProductCreateDto } from '../dto/product-create.dto';
import { ProductUpdateDto } from '../dto/product-update.dto';
import { ProductImageUploadUrlResponseDto } from '../dto/product-image-upload-url-response.dto';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';

const actor = { sub: 'admin-1' } as JwtPayload;

describe('ProductsController', () => {
  let controller: ProductsController;
  let getActiveProducts: jest.Mocked<GetActiveProductsUseCase>;
  let getProductsByBusinessUnit: jest.Mocked<GetProductsByBusinessUnitUseCase>;
  let getProductById: jest.Mocked<GetProductByIdUseCase>;
  let createProduct: jest.Mocked<CreateProductUseCase>;
  let setProductActive: jest.Mocked<SetProductActiveUseCase>;
  let updateProduct: jest.Mocked<UpdateProductUseCase>;
  let createImageUploadUrl: jest.Mocked<CreateProductImageUploadUrlUseCase>;
  let confirmImageUpload: jest.Mocked<ConfirmProductImageUploadUseCase>;

  const buildProduct = (id = 'uuid-1'): Product =>
    new Product(
      id,
      'Açaí',
      null,
      Money.fromDecimalString('12.50'),
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
    setProductActive = { execute: jest.fn() } as unknown as jest.Mocked<SetProductActiveUseCase>;
    updateProduct = { execute: jest.fn() } as unknown as jest.Mocked<UpdateProductUseCase>;
    createImageUploadUrl = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateProductImageUploadUrlUseCase>;
    confirmImageUpload = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ConfirmProductImageUploadUseCase>;

    const moduleRef = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: GetActiveProductsUseCase, useValue: getActiveProducts },
        { provide: GetProductsByBusinessUnitUseCase, useValue: getProductsByBusinessUnit },
        { provide: GetProductByIdUseCase, useValue: getProductById },
        { provide: CreateProductUseCase, useValue: createProduct },
        { provide: SetProductActiveUseCase, useValue: setProductActive },
        { provide: UpdateProductUseCase, useValue: updateProduct },
        { provide: CreateProductImageUploadUrlUseCase, useValue: createImageUploadUrl },
        { provide: ConfirmProductImageUploadUseCase, useValue: confirmImageUpload },
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

  describe('activate', () => {
    it('should call the use-case with isActive=true and map the result', async () => {
      setProductActive.execute.mockResolvedValue(buildProduct('uuid-7'));

      const response = await controller.activate(actor, { productId: 'uuid-7' });

      expect(setProductActive.execute).toHaveBeenCalledWith('uuid-7', true, 'admin-1');
      expect(response).toBeInstanceOf(ProductResponseDto);
      expect(response.id).toBe('uuid-7');
    });
  });

  describe('deactivate', () => {
    it('should call the use-case with isActive=false and map the result', async () => {
      setProductActive.execute.mockResolvedValue(buildProduct('uuid-7'));

      const response = await controller.deactivate(actor, { productId: 'uuid-7' });

      expect(setProductActive.execute).toHaveBeenCalledWith('uuid-7', false, 'admin-1');
      expect(response).toBeInstanceOf(ProductResponseDto);
    });

    it('should propagate ProductNotFoundError raised by the use-case', async () => {
      setProductActive.execute.mockRejectedValue(new ProductNotFoundError('Product not found.'));

      await expect(controller.deactivate(actor, { productId: 'missing' })).rejects.toBeInstanceOf(
        ProductNotFoundError,
      );
    });
  });

  describe('update', () => {
    it('should forward the patch and actor id, then map the result', async () => {
      updateProduct.execute.mockResolvedValue(buildProduct('uuid-9'));

      const body: ProductUpdateDto = { name: 'Vatapá', price: '20.00' };

      const response = await controller.update(actor, { productId: 'uuid-9' }, body);

      expect(updateProduct.execute).toHaveBeenCalledWith('uuid-9', body, 'admin-1');
      expect(response).toBeInstanceOf(ProductResponseDto);
      expect(response.id).toBe('uuid-9');
    });

    it('should propagate ProductNotFoundError raised by the use-case', async () => {
      updateProduct.execute.mockRejectedValue(new ProductNotFoundError('Product not found.'));

      await expect(
        controller.update(actor, { productId: 'missing' }, { name: 'Vatapá' }),
      ).rejects.toBeInstanceOf(ProductNotFoundError);
    });
  });

  describe('create', () => {
    it('should map the created product to its response DTO', async () => {
      const product = buildProduct('uuid-43');
      createProduct.execute.mockResolvedValue(product);

      const body: ProductCreateDto = {
        name: product.name,
        price: product.price.toDecimalString(),
        categoryId: product.categoryId,
        imageUrl: product.imageUrl,
      };

      const response = await controller.create(body);

      expect(createProduct.execute).toHaveBeenCalledWith(body);
      expect(response).toBeInstanceOf(ProductResponseDto);
      expect(response.id).toBe('uuid-43');
      expect(response.price).toBe('12.50');
    });
  });

  describe('createImageUploadUrl', () => {
    it('forwards the param-derived productId and the requested content type', async () => {
      createImageUploadUrl.execute.mockResolvedValue({
        signedUrl: 'https://storage.test/upload/sign/products/uuid-9/token.png?token=abc',
        token: 'abc',
        path: 'products/uuid-9/token.png',
        expiresInSeconds: 7200,
      });

      const response = await controller.createImageUploadUrl(
        { productId: 'uuid-9' },
        { contentType: 'image/png' },
      );

      expect(createImageUploadUrl.execute).toHaveBeenCalledWith({
        productId: 'uuid-9',
        contentType: 'image/png',
      });
      expect(response).toBeInstanceOf(ProductImageUploadUrlResponseDto);
      expect(response.path).toBe('products/uuid-9/token.png');
      expect(response.expiresInSeconds).toBe(7200);
    });

    it('propagates ProductNotFoundError raised by the use-case', async () => {
      createImageUploadUrl.execute.mockRejectedValue(new ProductNotFoundError('Not found.'));

      await expect(
        controller.createImageUploadUrl({ productId: 'missing' }, { contentType: 'image/png' }),
      ).rejects.toBeInstanceOf(ProductNotFoundError);
    });
  });

  describe('confirmImage', () => {
    it('forwards the param-derived productId, the echoed path and the actor id', async () => {
      confirmImageUpload.execute.mockResolvedValue(buildProduct('uuid-9'));

      const response = await controller.confirmImage(
        actor,
        { productId: 'uuid-9' },
        { path: 'products/uuid-9/token.png' },
      );

      expect(confirmImageUpload.execute).toHaveBeenCalledWith({
        productId: 'uuid-9',
        path: 'products/uuid-9/token.png',
        actorId: 'admin-1',
      });
      expect(response).toBeInstanceOf(ProductResponseDto);
      expect(response.id).toBe('uuid-9');
    });

    it('propagates ProductNotFoundError raised by the use-case', async () => {
      confirmImageUpload.execute.mockRejectedValue(new ProductNotFoundError('Not found.'));

      await expect(
        controller.confirmImage(actor, { productId: 'missing' }, { path: 'products/x/y.png' }),
      ).rejects.toBeInstanceOf(ProductNotFoundError);
    });
  });
});
