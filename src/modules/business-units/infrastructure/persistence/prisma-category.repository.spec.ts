import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma, type Category as PrismaCategory } from '@prisma/client';
import { PrismaCategoryRepository } from './prisma-category.repository';
import type { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import type { CreateCategoryInput } from '../../domain/repositories/category.repository';
import { Category } from '../../domain/entities/category.entity';
import { CategoryAlreadyExistsError } from '../../domain/errors/category-already-exists.error';
import { knownRequestError } from '@shared/infrastructure/prisma/testing/prisma-mock';

type CategoryCreateFn = (args: unknown) => Promise<PrismaCategory>;
type CategoryFindUniqueFn = (args: unknown) => Promise<PrismaCategory | null>;
type CategoryFindManyFn = (args: unknown) => Promise<PrismaCategory[]>;
type CategoryUpdateFn = (args: unknown) => Promise<PrismaCategory>;

const knownError = (code: string): Prisma.PrismaClientKnownRequestError =>
  knownRequestError(code, { target: ['name'] });

describe('PrismaCategoryRepository', () => {
  let create: jest.MockedFunction<CategoryCreateFn>;
  let findUnique: jest.MockedFunction<CategoryFindUniqueFn>;
  let findMany: jest.MockedFunction<CategoryFindManyFn>;
  let update: jest.MockedFunction<CategoryUpdateFn>;
  let repo: PrismaCategoryRepository;

  const input: CreateCategoryInput = {
    name: 'Bebidas',
    description: 'Sucos e refrigerantes',
  };

  const persistedRow: PrismaCategory = {
    id: 'uuid-1',
    name: 'Bebidas',
    description: 'Sucos e refrigerantes',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };

  beforeEach(() => {
    create = jest.fn() as jest.MockedFunction<CategoryCreateFn>;
    findUnique = jest.fn() as jest.MockedFunction<CategoryFindUniqueFn>;
    findMany = jest.fn() as jest.MockedFunction<CategoryFindManyFn>;
    update = jest.fn() as jest.MockedFunction<CategoryUpdateFn>;
    const prisma = {
      category: { create, findUnique, findMany, update },
    } as unknown as PrismaService;
    repo = new PrismaCategoryRepository(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('maps a persisted row to a domain Category', async () => {
      findUnique.mockResolvedValue(persistedRow);

      const category = await repo.findById('uuid-1');

      expect(category).toBeInstanceOf(Category);
      expect(category?.id).toBe('uuid-1');
      expect(category?.isActive).toBe(true);
    });

    it('returns null when no row matches', async () => {
      findUnique.mockResolvedValue(null);

      await expect(repo.findById('missing')).resolves.toBeNull();
    });
  });

  describe('findAllActive', () => {
    it('filters to active rows and forwards the cursor page', async () => {
      findMany.mockResolvedValue([persistedRow]);

      const result = await repo.findAllActive({
        pagination: { cursor: 'prev-id', take: 21 },
        filters: { search: 'beb' },
      });

      expect(findMany).toHaveBeenCalledWith({
        where: { isActive: true, name: { contains: 'beb', mode: 'insensitive' } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
        cursor: { id: 'prev-id' },
        skip: 1,
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(Category);
    });

    it('omits cursor/skip on the first page and applies no filters', async () => {
      findMany.mockResolvedValue([]);

      await repo.findAllActive({ pagination: { cursor: undefined, take: 21 } });

      expect(findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      });
    });
  });

  describe('create', () => {
    it('forwards the fields and maps the persisted row to a domain Category', async () => {
      create.mockResolvedValue(persistedRow);

      const category = await repo.create(input);

      expect(create).toHaveBeenCalledWith({
        data: { name: input.name, description: input.description },
      });
      expect(category).toBeInstanceOf(Category);
      expect(category.id).toBe('uuid-1');
    });

    it('translates a P2002 unique-constraint violation into CategoryAlreadyExistsError, chaining the cause', async () => {
      const prismaError = knownError('P2002');
      create.mockRejectedValue(prismaError);

      await expect(repo.create(input)).rejects.toBeInstanceOf(CategoryAlreadyExistsError);
      await expect(repo.create(input)).rejects.toMatchObject({ cause: prismaError });
    });

    it('rethrows unmapped Prisma error codes unchanged', async () => {
      const prismaError = knownError('P2000');
      create.mockRejectedValue(prismaError);

      await expect(repo.create(input)).rejects.toBe(prismaError);
    });

    it('rethrows non-Prisma errors unchanged', async () => {
      const genericError = new Error('connection lost');
      create.mockRejectedValue(genericError);

      await expect(repo.create(input)).rejects.toBe(genericError);
    });
  });

  describe('update', () => {
    const domainCategory = new Category(
      'uuid-1',
      'Sobremesas',
      'Doces',
      false,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );

    it('writes the editable fields and maps the row back', async () => {
      update.mockResolvedValue({
        ...persistedRow,
        name: 'Sobremesas',
        description: 'Doces',
        isActive: false,
      });

      const result = await repo.update(domainCategory);

      expect(update).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        data: { name: 'Sobremesas', description: 'Doces', isActive: false },
      });
      expect(result).toBeInstanceOf(Category);
      expect(result?.name).toBe('Sobremesas');
      expect(result?.isActive).toBe(false);
    });

    it('translates a P2002 unique-constraint violation into CategoryAlreadyExistsError, chaining the cause', async () => {
      const prismaError = knownError('P2002');
      update.mockRejectedValue(prismaError);

      await expect(repo.update(domainCategory)).rejects.toBeInstanceOf(CategoryAlreadyExistsError);
      await expect(repo.update(domainCategory)).rejects.toMatchObject({ cause: prismaError });
    });

    it('returns null on P2025 when no category matches the id', async () => {
      update.mockRejectedValue(knownError('P2025'));

      await expect(repo.update(domainCategory)).resolves.toBeNull();
    });

    it('rethrows unmapped Prisma error codes unchanged', async () => {
      const prismaError = knownError('P2000');
      update.mockRejectedValue(prismaError);

      await expect(repo.update(domainCategory)).rejects.toBe(prismaError);
    });

    it('rethrows non-Prisma errors unchanged', async () => {
      const genericError = new Error('connection lost');
      update.mockRejectedValue(genericError);

      await expect(repo.update(domainCategory)).rejects.toBe(genericError);
    });
  });
});
