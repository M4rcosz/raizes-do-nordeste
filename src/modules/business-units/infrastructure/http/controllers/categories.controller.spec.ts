import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { CategoriesController } from './categories.controller';
import { ListCategoriesUseCase } from '../../../application/use-cases/list-categories.use-case';
import { GetCategoryByIdUseCase } from '../../../application/use-cases/get-category-by-id.use-case';
import { CreateCategoryUseCase } from '../../../application/use-cases/create-category.use-case';
import { UpdateCategoryUseCase } from '../../../application/use-cases/update-category.use-case';
import { Category } from '../../../domain/entities/category.entity';
import { CategoryResponseDto } from '../dto/category-response.dto';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { CategoryNotFoundError } from '../../../domain/errors/category-not-found.error';
import { CategoryCreateDto } from '../dto/category-create.dto';
import { CategoryUpdateDto } from '../dto/category-update.dto';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';

const actor = { sub: 'admin-1' } as JwtPayload;

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let listCategories: jest.Mocked<ListCategoriesUseCase>;
  let getCategoryById: jest.Mocked<GetCategoryByIdUseCase>;
  let createCategory: jest.Mocked<CreateCategoryUseCase>;
  let updateCategory: jest.Mocked<UpdateCategoryUseCase>;

  const buildCategory = (id = 'uuid-1'): Category =>
    new Category(
      id,
      'Bebidas',
      null,
      true,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );

  beforeAll(async () => {
    listCategories = { execute: jest.fn() } as unknown as jest.Mocked<ListCategoriesUseCase>;
    getCategoryById = { execute: jest.fn() } as unknown as jest.Mocked<GetCategoryByIdUseCase>;
    createCategory = { execute: jest.fn() } as unknown as jest.Mocked<CreateCategoryUseCase>;
    updateCategory = { execute: jest.fn() } as unknown as jest.Mocked<UpdateCategoryUseCase>;

    const moduleRef = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        { provide: ListCategoriesUseCase, useValue: listCategories },
        { provide: GetCategoryByIdUseCase, useValue: getCategoryById },
        { provide: CreateCategoryUseCase, useValue: createCategory },
        { provide: UpdateCategoryUseCase, useValue: updateCategory },
      ],
    }).compile();

    controller = moduleRef.get(CategoriesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findActive', () => {
    it('should return a paginated DTO envelope with mapped items', async () => {
      listCategories.execute.mockResolvedValue({
        data: [buildCategory()],
        meta: { limit: 20, hasMore: false, nextCursor: null },
      });

      const response = await controller.findActive({ limit: 20 });

      expect(response).toBeInstanceOf(PaginatedResponseDto);
      expect(response.data).toHaveLength(1);
      expect(response.data[0]).toBeInstanceOf(CategoryResponseDto);
      expect(response.meta).toEqual({ limit: 20, hasMore: false, nextCursor: null });
    });

    it('should clamp out-of-range limits to MAX_LIMIT', async () => {
      listCategories.execute.mockResolvedValue({
        data: [],
        meta: { limit: 100, hasMore: false, nextCursor: null },
      });

      await controller.findActive({ limit: 99999 });

      expect(listCategories.execute).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
    });

    it('should pass cursor and search filter through to the use-case', async () => {
      listCategories.execute.mockResolvedValue({
        data: [],
        meta: { limit: 20, hasMore: false, nextCursor: null },
      });

      await controller.findActive({ limit: 20, cursor: 'cursor-id', search: 'beb' });

      expect(listCategories.execute).toHaveBeenCalledWith({
        cursor: 'cursor-id',
        limit: 20,
        filters: { search: 'beb' },
      });
    });

    it('should pass undefined filters when no search is provided', async () => {
      listCategories.execute.mockResolvedValue({
        data: [],
        meta: { limit: 20, hasMore: false, nextCursor: null },
      });

      await controller.findActive({ limit: 20 });

      expect(listCategories.execute).toHaveBeenCalledWith({
        cursor: undefined,
        limit: 20,
        filters: undefined,
      });
    });
  });

  describe('findById', () => {
    it('should return the mapped DTO when the category exists', async () => {
      getCategoryById.execute.mockResolvedValue(buildCategory('uuid-42'));

      const response = await controller.findById({ categoryId: 'uuid-42' });

      expect(getCategoryById.execute).toHaveBeenCalledWith('uuid-42');
      expect(response).toBeInstanceOf(CategoryResponseDto);
      expect(response.id).toBe('uuid-42');
    });

    it('should propagate CategoryNotFoundError raised by the use-case', async () => {
      getCategoryById.execute.mockRejectedValue(new CategoryNotFoundError('Category not found.'));

      await expect(controller.findById({ categoryId: 'missing' })).rejects.toBeInstanceOf(
        CategoryNotFoundError,
      );
    });
  });

  describe('create', () => {
    it('should forward the actor id and map the created category', async () => {
      createCategory.execute.mockResolvedValue(buildCategory('uuid-43'));

      const body: CategoryCreateDto = { name: 'Bebidas' };

      const response = await controller.create(actor, body);

      expect(createCategory.execute).toHaveBeenCalledWith(body, 'admin-1');
      expect(response).toBeInstanceOf(CategoryResponseDto);
      expect(response.id).toBe('uuid-43');
    });
  });

  describe('update', () => {
    it('should forward the patch and actor id, then map the result', async () => {
      updateCategory.execute.mockResolvedValue(buildCategory('uuid-9'));

      const body: CategoryUpdateDto = { name: 'Sobremesas' };

      const response = await controller.update(actor, { categoryId: 'uuid-9' }, body);

      expect(updateCategory.execute).toHaveBeenCalledWith('uuid-9', body, 'admin-1');
      expect(response).toBeInstanceOf(CategoryResponseDto);
      expect(response.id).toBe('uuid-9');
    });

    it('should propagate CategoryNotFoundError raised by the use-case', async () => {
      updateCategory.execute.mockRejectedValue(new CategoryNotFoundError('Category not found.'));

      await expect(
        controller.update(actor, { categoryId: 'missing' }, { name: 'Sobremesas' }),
      ).rejects.toBeInstanceOf(CategoryNotFoundError);
    });
  });
});
