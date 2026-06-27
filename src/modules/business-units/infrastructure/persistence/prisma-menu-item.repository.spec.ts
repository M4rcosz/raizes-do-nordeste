import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  Prisma,
  type BusinessUnitMenuItem as PrismaMenuItem,
  type Product as PrismaProduct,
} from '@prisma/client';
import { Money } from '@shared/domain/value-objects/money';
import { PrismaMenuItemRepository } from './prisma-menu-item.repository';
import type { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import type {
  CreateMenuItemInput,
  UpdateMenuItemInput,
} from '../../domain/repositories/menu-item.repository';
import { MenuItem } from '../../domain/entities/menu-item.entity';
import { MenuItemAlreadyExistsError } from '../../domain/errors/menu-item-already-exists.error';
import { BusinessUnitNotFoundError } from '../../application/errors/business-unit-not-found.error';
import { ProductNotFoundError } from '../../application/errors/product-not-found.error';
import { CorruptPersistedMoneyError } from '@shared/errors/infrastructure/corrupt-persisted-money.error';
import { InvalidMoneyError } from '@shared/errors/domain/invalid-money.error';

type AnyFn = (args: unknown) => Promise<unknown>;

const knownError = (
  code: string,
  meta?: Record<string, unknown>,
): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: '7.7.0',
    meta,
  });

describe('PrismaMenuItemRepository', () => {
  let create: jest.MockedFunction<AnyFn>;
  let findFirst: jest.MockedFunction<AnyFn>;
  let findMany: jest.MockedFunction<AnyFn>;
  let update: jest.MockedFunction<AnyFn>;
  let repo: PrismaMenuItemRepository;

  const input: CreateMenuItemInput = {
    businessUnitId: 'bu-1',
    productId: 'product-1',
    customPrice: '15.90',
  };

  const persistedRow: PrismaMenuItem = {
    id: 'menu-item-1',
    businessUnitId: 'bu-1',
    productId: 'product-1',
    customPrice: new Prisma.Decimal('15.90'),
    isAvailable: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };

  const persistedProduct: PrismaProduct = {
    id: 'product-1',
    categoryId: 'category-1',
    name: 'Moqueca',
    description: 'Bahian fish stew',
    basePrice: new Prisma.Decimal('30.00'),
    imageUrl: 'https://example.com/moqueca.jpg',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };

  const rowWithProduct = { ...persistedRow, product: persistedProduct };

  beforeEach(() => {
    create = jest.fn() as jest.MockedFunction<AnyFn>;
    findFirst = jest.fn() as jest.MockedFunction<AnyFn>;
    findMany = jest.fn() as jest.MockedFunction<AnyFn>;
    update = jest.fn() as jest.MockedFunction<AnyFn>;
    const prisma = {
      businessUnitMenuItem: { create, findFirst, findMany, update },
    } as unknown as PrismaService;
    repo = new PrismaMenuItemRepository(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('forwards the custom price as a string and maps the persisted row to a domain MenuItem', async () => {
      create.mockResolvedValue(persistedRow);

      const item = await repo.create(input);

      expect(create).toHaveBeenCalledWith({
        data: {
          businessUnitId: input.businessUnitId,
          productId: input.productId,
          customPrice: '15.90',
        },
      });
      expect(item).toBeInstanceOf(MenuItem);
      expect(item.id).toBe('menu-item-1');
      expect(item.customPrice).toBeInstanceOf(Money);
      expect(item.customPrice.equals(Money.fromDecimalString('15.90'))).toBe(true);
    });

    it('passes isAvailable through only when provided', async () => {
      create.mockResolvedValue({ ...persistedRow, isAvailable: false });

      await repo.create({ ...input, isAvailable: false });

      expect(create).toHaveBeenCalledWith({
        data: {
          businessUnitId: input.businessUnitId,
          productId: input.productId,
          customPrice: '15.90',
          isAvailable: false,
        },
      });
    });

    it('translates a P2002 unique-constraint violation into MenuItemAlreadyExistsError, chaining the cause', async () => {
      const prismaError = knownError('P2002', { target: ['business_unit_id', 'product_id'] });
      create.mockRejectedValue(prismaError);

      await expect(repo.create(input)).rejects.toBeInstanceOf(MenuItemAlreadyExistsError);
      await expect(repo.create(input)).rejects.toMatchObject({ cause: prismaError });
    });

    it('translates a P2003 on the product foreign key into ProductNotFoundError', async () => {
      const prismaError = knownError('P2003', {
        field_name: 'business_unit_menu_items_product_id_fkey (index)',
      });
      create.mockRejectedValue(prismaError);

      await expect(repo.create(input)).rejects.toBeInstanceOf(ProductNotFoundError);
      await expect(repo.create(input)).rejects.toMatchObject({ cause: prismaError });
    });

    it('translates a P2003 on the business unit foreign key into BusinessUnitNotFoundError', async () => {
      const prismaError = knownError('P2003', {
        field_name: 'business_unit_menu_items_business_unit_id_fkey (index)',
      });
      create.mockRejectedValue(prismaError);

      await expect(repo.create(input)).rejects.toBeInstanceOf(BusinessUnitNotFoundError);
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

  describe('findAvailableById', () => {
    it('maps a healthy joined row to a read model', async () => {
      findFirst.mockResolvedValue(rowWithProduct);

      const result = await repo.findAvailableById('menu-item-1', 'bu-1');

      expect(result?.menuItem).toBeInstanceOf(MenuItem);
      expect(result?.menuItem.customPrice.equals(Money.fromDecimalString('15.90'))).toBe(true);
      expect(result?.product).toEqual({
        id: 'product-1',
        name: 'Moqueca',
        description: 'Bahian fish stew',
        imageUrl: 'https://example.com/moqueca.jpg',
      });
    });

    it('returns null when no available item matches', async () => {
      findFirst.mockResolvedValue(null);

      await expect(repo.findAvailableById('missing', 'bu-1')).resolves.toBeNull();
    });

    it('rethrows a corrupt persisted price as CorruptPersistedMoneyError, not the raw InvalidMoneyError', async () => {
      const corruptRow = {
        ...rowWithProduct,
        customPrice: { toString: (): string => 'NaN' },
      };
      findFirst.mockResolvedValue(corruptRow);

      const error = await repo.findAvailableById('menu-item-1', 'bu-1').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CorruptPersistedMoneyError);
      expect(error).not.toBeInstanceOf(InvalidMoneyError);
      expect((error as CorruptPersistedMoneyError).cause).toBeInstanceOf(InvalidMoneyError);
      expect((error as Error).message).not.toContain('NaN');
    });
  });

  describe('findAllByBusinessUnit', () => {
    it('filters to available items and active product/unit on the public path', async () => {
      findMany.mockResolvedValue([rowWithProduct]);

      const result = await repo.findAllByBusinessUnit({
        businessUnitId: 'bu-1',
        pagination: { take: 21 },
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            businessUnitId: 'bu-1',
            isAvailable: true,
            product: { isActive: true },
            businessUnit: { isActive: true },
          },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].menuItem).toBeInstanceOf(MenuItem);
    });

    it('drops the availability filters when includeUnavailable is set (management view)', async () => {
      findMany.mockResolvedValue([]);

      await repo.findAllByBusinessUnit({
        businessUnitId: 'bu-1',
        pagination: { take: 21, cursor: 'cursor-id' },
        includeUnavailable: true,
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { businessUnitId: 'bu-1' },
          cursor: { id: 'cursor-id' },
          skip: 1,
        }),
      );
    });
  });

  describe('update', () => {
    it('returns null when no item matches the (id, businessUnitId) pair', async () => {
      findFirst.mockResolvedValue(null);

      await expect(
        repo.update({ id: 'menu-item-1', businessUnitId: 'bu-1', isAvailable: false }),
      ).resolves.toBeNull();
      expect(update).not.toHaveBeenCalled();
    });

    it('applies only the provided fields and maps the updated row', async () => {
      findFirst.mockResolvedValue({ id: 'menu-item-1' });
      update.mockResolvedValue({ ...persistedRow, customPrice: new Prisma.Decimal('19.90') });

      const patch: UpdateMenuItemInput = {
        id: 'menu-item-1',
        businessUnitId: 'bu-1',
        customPrice: '19.90',
      };
      const result = await repo.update(patch);

      expect(update).toHaveBeenCalledWith({
        where: { id: 'menu-item-1' },
        data: { customPrice: '19.90' },
      });
      expect(result?.customPrice.equals(Money.fromDecimalString('19.90'))).toBe(true);
    });
  });
});
