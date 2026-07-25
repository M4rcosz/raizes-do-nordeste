import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma, type Product as PrismaProduct } from '@prisma/client';
import { Money } from '@shared/domain/value-objects/money';
import { PrismaProductRepository } from './prisma-product.repository';
import type { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import type { CreateProductInput } from '../../domain/repositories/product.repository';
import { Product } from '../../domain/entities/product.entity';
import { ProductAlreadyExistsError } from '../../domain/errors/product-already-exists.error';
import { CategoryNotFoundError } from '../../domain/errors/category-not-found.error';
import { CorruptPersistedMoneyError } from '@shared/errors/infrastructure/corrupt-persisted-money.error';
import { InvalidMoneyError } from '@shared/errors/domain/invalid-money.error';
import { knownRequestError } from '@shared/infrastructure/prisma/testing/prisma-mock';

type ProductCreateFn = (args: unknown) => Promise<PrismaProduct>;
type ProductFindUniqueFn = (args: unknown) => Promise<PrismaProduct | null>;
type ProductUpdateFn = (args: unknown) => Promise<PrismaProduct>;
type ProductFindManyFn = (args: unknown) => Promise<PrismaProduct[]>;
type MenuItemFindManyFn = (args: unknown) => Promise<unknown[]>;

const knownError = (code: string): Prisma.PrismaClientKnownRequestError =>
  knownRequestError(code, { target: ['name'] });

type Args = { where?: Record<string, unknown> } & Record<string, unknown>;

describe('PrismaProductRepository', () => {
  let create: jest.MockedFunction<ProductCreateFn>;
  let findUnique: jest.MockedFunction<ProductFindUniqueFn>;
  let update: jest.MockedFunction<ProductUpdateFn>;
  let findMany: jest.MockedFunction<ProductFindManyFn>;
  let menuItemFindMany: jest.MockedFunction<MenuItemFindManyFn>;
  let repo: PrismaProductRepository;

  const input: CreateProductInput = {
    name: 'Acarajé',
    description: 'Feijão-fradinho cake',
    price: '12.50',
    categoryId: 'category-1',
    imageUrl: 'https://example.com/acaraje.jpg',
  };

  const persistedRow: PrismaProduct = {
    id: 'uuid-1',
    categoryId: 'category-1',
    name: 'Acarajé',
    description: 'Feijão-fradinho cake',
    basePrice: new Prisma.Decimal('12.50'),
    imageUrl: 'https://example.com/acaraje.jpg',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };

  beforeEach(() => {
    create = jest.fn() as jest.MockedFunction<ProductCreateFn>;
    findUnique = jest.fn() as jest.MockedFunction<ProductFindUniqueFn>;
    update = jest.fn() as jest.MockedFunction<ProductUpdateFn>;
    findMany = jest.fn() as jest.MockedFunction<ProductFindManyFn>;
    menuItemFindMany = jest.fn() as jest.MockedFunction<MenuItemFindManyFn>;
    const prisma = {
      product: { create, findUnique, update, findMany },
      businessUnitMenuItem: { findMany: menuItemFindMany },
    } as unknown as PrismaService;
    repo = new PrismaProductRepository(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('forwards the price as a string and maps the persisted row to a domain Product', async () => {
      create.mockResolvedValue(persistedRow);

      const product = await repo.create(input);

      // Money is forwarded as the original decimal string - never coerced to a float.
      expect(create).toHaveBeenCalledWith({
        data: {
          name: input.name,
          description: input.description,
          basePrice: '12.50',
          categoryId: input.categoryId,
          imageUrl: input.imageUrl,
        },
      });
      expect(product).toBeInstanceOf(Product);
      expect(product.id).toBe('uuid-1');
      expect(product.price).toBeInstanceOf(Money);
      expect(product.price.equals(Money.fromDecimalString('12.50'))).toBe(true);
      expect(product.imageUrl).toBe(input.imageUrl);
    });

    it('translates a P2002 unique-constraint violation into ProductAlreadyExistsError, chaining the cause', async () => {
      const prismaError = knownError('P2002');
      create.mockRejectedValue(prismaError);

      await expect(repo.create(input)).rejects.toBeInstanceOf(ProductAlreadyExistsError);
      await expect(repo.create(input)).rejects.toMatchObject({ cause: prismaError });
    });

    it('translates a P2003 foreign-key violation into CategoryNotFoundError, chaining the cause', async () => {
      const prismaError = knownError('P2003');
      create.mockRejectedValue(prismaError);

      await expect(repo.create(input)).rejects.toBeInstanceOf(CategoryNotFoundError);
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
    const domainProduct = new Product(
      'uuid-1',
      'Vatapá',
      'Creamy shrimp paste',
      Money.fromDecimalString('20.00'),
      true,
      'category-2',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
      'https://example.com/vatapa.jpg',
    );

    it('writes the editable fields with the price as a decimal string and maps the row back', async () => {
      update.mockResolvedValue({
        ...persistedRow,
        name: 'Vatapá',
        description: 'Creamy shrimp paste',
        basePrice: new Prisma.Decimal('20.00'),
        categoryId: 'category-2',
        imageUrl: 'https://example.com/vatapa.jpg',
      });

      const result = await repo.update(domainProduct);

      expect(update).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        data: {
          name: 'Vatapá',
          description: 'Creamy shrimp paste',
          basePrice: '20.00',
          categoryId: 'category-2',
          imageUrl: 'https://example.com/vatapa.jpg',
        },
      });
      expect(result).toBeInstanceOf(Product);
      expect(result?.name).toBe('Vatapá');
      expect(result?.price.equals(Money.fromDecimalString('20.00'))).toBe(true);
    });

    it('translates a P2002 unique-constraint violation into ProductAlreadyExistsError, chaining the cause', async () => {
      const prismaError = knownError('P2002');
      update.mockRejectedValue(prismaError);

      await expect(repo.update(domainProduct)).rejects.toBeInstanceOf(ProductAlreadyExistsError);
      await expect(repo.update(domainProduct)).rejects.toMatchObject({ cause: prismaError });
    });

    it('translates a P2003 foreign-key violation into CategoryNotFoundError, chaining the cause', async () => {
      const prismaError = knownError('P2003');
      update.mockRejectedValue(prismaError);

      await expect(repo.update(domainProduct)).rejects.toBeInstanceOf(CategoryNotFoundError);
      await expect(repo.update(domainProduct)).rejects.toMatchObject({ cause: prismaError });
    });

    it('returns null on P2025 when no product matches the id', async () => {
      update.mockRejectedValue(knownError('P2025'));

      await expect(repo.update(domainProduct)).resolves.toBeNull();
    });

    it('rethrows unmapped Prisma error codes unchanged', async () => {
      const prismaError = knownError('P2000');
      update.mockRejectedValue(prismaError);

      await expect(repo.update(domainProduct)).rejects.toBe(prismaError);
    });

    it('rethrows non-Prisma errors unchanged', async () => {
      const genericError = new Error('connection lost');
      update.mockRejectedValue(genericError);

      await expect(repo.update(domainProduct)).rejects.toBe(genericError);
    });
  });

  describe('findById read-path Money parsing', () => {
    // A corrupt basePrice whose toString() returns something big.js rejects.
    const corruptValue = 'NaN';
    const corruptRow = {
      ...persistedRow,
      basePrice: { toString: () => corruptValue },
    } as unknown as PrismaProduct;

    it('maps a healthy persisted row to a domain Product', async () => {
      findUnique.mockResolvedValue(persistedRow);

      const product = await repo.findById('uuid-1');

      expect(product).toBeInstanceOf(Product);
      expect(product?.price.equals(Money.fromDecimalString('12.50'))).toBe(true);
    });

    it('rethrows a corrupt persisted price as CorruptPersistedMoneyError, not the raw InvalidMoneyError', async () => {
      findUnique.mockResolvedValue(corruptRow);

      await expect(repo.findById('uuid-1')).rejects.toBeInstanceOf(CorruptPersistedMoneyError);
      await expect(repo.findById('uuid-1')).rejects.not.toBeInstanceOf(InvalidMoneyError);
    });

    it('preserves the parse failure as cause for server-side logs', async () => {
      findUnique.mockResolvedValue(corruptRow);

      const error = await repo.findById('uuid-1').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CorruptPersistedMoneyError);
      expect((error as CorruptPersistedMoneyError).cause).toBeInstanceOf(InvalidMoneyError);
    });

    it('never leaks the raw corrupt value in the client-facing message', async () => {
      findUnique.mockResolvedValue(corruptRow);

      const error = await repo.findById('uuid-1').catch((e: unknown) => e);

      expect((error as Error).message).toBe('A persisted monetary value is corrupt.');
      expect((error as Error).message).not.toContain(corruptValue);
    });

    it('returns null when no row matches', async () => {
      findUnique.mockResolvedValue(null);

      await expect(repo.findById('missing')).resolves.toBeNull();
      expect(findUnique).toHaveBeenCalledWith({ where: { id: 'missing' } });
    });

    // Only InvalidMoneyError means corrupt data. Anything else is a real fault and
    // must not be relabelled as a money problem.
    it('rethrows a non-money parse failure untouched', async () => {
      const boom = new Error('toString exploded');
      findUnique.mockResolvedValue({
        ...persistedRow,
        basePrice: {
          toString: () => {
            throw boom;
          },
        },
      } as unknown as PrismaProduct);

      await expect(repo.findById('uuid-1')).rejects.toBe(boom);
    });
  });

  describe('findAllActive', () => {
    const argsOf = (): Args => findMany.mock.calls[0][0] as Args;

    beforeEach(() => {
      findMany.mockResolvedValue([persistedRow]);
    });

    // The active gate is not a caller-supplied filter: it is always applied.
    it('always constrains to active products', async () => {
      await repo.findAllActive({ take: 20 });

      expect(argsOf().where).toStrictEqual({ isActive: true });
    });

    it('AND-combines the search and category filters with the active gate', async () => {
      await repo.findAllActive({
        filters: { search: 'acara', categoryId: 'category-1' },
        take: 20,
      });

      expect(argsOf().where).toStrictEqual({
        isActive: true,
        name: { contains: 'acara', mode: 'insensitive' },
        categoryId: 'category-1',
      });
    });

    it('applies the search filter alone, leaving categoryId unconstrained', async () => {
      await repo.findAllActive({ filters: { search: 'acara' }, take: 20 });

      expect(argsOf().where).toStrictEqual({
        isActive: true,
        name: { contains: 'acara', mode: 'insensitive' },
      });
    });

    it('applies the category filter alone, leaving the name unconstrained', async () => {
      await repo.findAllActive({ filters: { categoryId: 'category-1' }, take: 20 });

      expect(argsOf().where).toStrictEqual({ isActive: true, categoryId: 'category-1' });
    });

    it('ignores an empty filter object', async () => {
      await repo.findAllActive({ filters: {}, take: 20 });

      expect(argsOf().where).toStrictEqual({ isActive: true });
    });

    it('maps rows to domain Products', async () => {
      const products = await repo.findAllActive({ take: 20 });

      expect(products).toHaveLength(1);
      expect(products[0]).toBeInstanceOf(Product);
      expect(products[0].price.equals(Money.fromDecimalString('12.50'))).toBe(true);
    });

    it('orders by a stable (createdAt, id) key so the cursor cannot skip rows', async () => {
      await repo.findAllActive({ take: 20 });

      expect(argsOf().orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });

    it('pages by comparing the sort key, never by a positional cursor', async () => {
      const keysetAt = new Date('2026-01-01T00:00:00Z');

      await repo.findAllActive({ take: 20, keyset: { timestamp: keysetAt, id: 'uuid-0' } });

      // Value comparison, so the keyset row need not still be active. A positional
      // cursor resolves a position inside the isActive-filtered set, so deactivating
      // that product mid-pagination would shift it and `skip: 1` would eat the next
      // row. Mirrors the orderBy: (createdAt desc, id desc).
      expect(argsOf().where).toMatchObject({
        AND: [
          {
            OR: [{ createdAt: { lt: keysetAt } }, { createdAt: keysetAt, id: { lt: 'uuid-0' } }],
          },
        ],
      });
      expect(argsOf()).toMatchObject({ take: 20 });
      expect(argsOf()).not.toHaveProperty('cursor');
      expect(argsOf()).not.toHaveProperty('skip');
    });

    it('omits the keyset predicate on the first page', async () => {
      await repo.findAllActive({ take: 20 });

      expect(argsOf().where).not.toHaveProperty('AND');
      expect(argsOf()).not.toHaveProperty('cursor');
      expect(argsOf()).not.toHaveProperty('skip');
    });
  });

  describe('findAllByBusinessUnit', () => {
    const argsOf = (): Args => menuItemFindMany.mock.calls[0][0] as Args;
    const menuItem = (customPrice: Prisma.Decimal | null) => ({
      businessUnitId: 'bu-1',
      productId: 'uuid-1',
      customPrice,
      product: persistedRow,
    });

    it('constrains to the unit and to available items only', async () => {
      menuItemFindMany.mockResolvedValue([menuItem(null)]);

      await repo.findAllByBusinessUnit({ businessUnitId: 'bu-1', take: 20 });

      expect(argsOf().where).toStrictEqual({
        businessUnitId: 'bu-1',
        isAvailable: true,
        product: {},
      });
    });

    it('nests the product filters under the product relation', async () => {
      menuItemFindMany.mockResolvedValue([menuItem(null)]);

      await repo.findAllByBusinessUnit({
        businessUnitId: 'bu-1',
        filters: { search: 'acara', categoryId: 'category-1' },
        take: 20,
      });

      expect(argsOf().where).toStrictEqual({
        businessUnitId: 'bu-1',
        isAvailable: true,
        product: {
          name: { contains: 'acara', mode: 'insensitive' },
          categoryId: 'category-1',
        },
      });
    });

    // The per-unit price override is the whole point of the menu-item table.
    it('prefers the unit customPrice over the product basePrice', async () => {
      menuItemFindMany.mockResolvedValue([menuItem(new Prisma.Decimal('9.90'))]);

      const [product] = await repo.findAllByBusinessUnit({
        businessUnitId: 'bu-1',
        take: 20,
      });

      expect(product.price.equals(Money.fromDecimalString('9.90'))).toBe(true);
    });

    it('falls back to the product basePrice when no override is set', async () => {
      menuItemFindMany.mockResolvedValue([menuItem(null)]);

      const [product] = await repo.findAllByBusinessUnit({
        businessUnitId: 'bu-1',
        take: 20,
      });

      expect(product.price.equals(Money.fromDecimalString('12.50'))).toBe(true);
      expect(product.id).toBe('uuid-1');
    });

    // A free item priced at 0.00 must not be mistaken for "no override" - `??` is
    // required here, `||` would silently fall back to the base price.
    it('honours a zero customPrice instead of falling back', async () => {
      menuItemFindMany.mockResolvedValue([menuItem(new Prisma.Decimal('0.00'))]);

      const [product] = await repo.findAllByBusinessUnit({
        businessUnitId: 'bu-1',
        take: 20,
      });

      expect(product.price.equals(Money.zero())).toBe(true);
    });

    it('pages by comparing the relation sort key, never by a positional cursor', async () => {
      menuItemFindMany.mockResolvedValue([menuItem(null)]);
      const keysetAt = new Date('2026-01-01T00:00:00Z');

      await repo.findAllByBusinessUnit({
        businessUnitId: 'bu-1',
        take: 20,
        keyset: { timestamp: keysetAt, id: 'uuid-0' },
      });

      // The orderBy sorts on the RELATION's createdAt, so the keyset compares the same
      // column. isAvailable is toggleable: pulling the cursor's item off the menu
      // between two pages would shift a positional cursor and drop the next product.
      expect(argsOf().where).toMatchObject({
        AND: [
          {
            OR: [
              { product: { createdAt: { lt: keysetAt } } },
              { product: { createdAt: keysetAt }, productId: { lt: 'uuid-0' } },
            ],
          },
        ],
      });
      expect(argsOf()).not.toHaveProperty('cursor');
      expect(argsOf()).not.toHaveProperty('skip');
    });

    it('omits the keyset predicate on the first page', async () => {
      menuItemFindMany.mockResolvedValue([menuItem(null)]);

      await repo.findAllByBusinessUnit({ businessUnitId: 'bu-1', take: 20 });

      expect(argsOf().where).not.toHaveProperty('AND');
      expect(argsOf()).not.toHaveProperty('cursor');
      expect(argsOf()).not.toHaveProperty('skip');
    });
  });

  describe('setActive', () => {
    it('flips the flag and maps the row back', async () => {
      update.mockResolvedValue({ ...persistedRow, isActive: false });

      const product = await repo.setActive('uuid-1', false);

      expect(update).toHaveBeenCalledWith({ where: { id: 'uuid-1' }, data: { isActive: false } });
      expect(product?.isActive).toBe(false);
    });

    // Honour the null contract so the use case raises a 404 instead of leaking a 500.
    it('returns null on P2025 (no product with that id)', async () => {
      update.mockRejectedValue(knownError('P2025'));

      await expect(repo.setActive('missing', true)).resolves.toBeNull();
    });

    it('rethrows any other Prisma error unchanged', async () => {
      const prismaError = knownError('P2002');
      update.mockRejectedValue(prismaError);

      await expect(repo.setActive('uuid-1', true)).rejects.toBe(prismaError);
    });

    it('rethrows non-Prisma errors unchanged', async () => {
      const genericError = new Error('connection lost');
      update.mockRejectedValue(genericError);

      await expect(repo.setActive('uuid-1', true)).rejects.toBe(genericError);
    });
  });

  describe('setImageUrl', () => {
    // Narrow on purpose: reusing update() would rewrite `name` too, so an
    // unrelated duplicate name would surface as a conflict on an image swap.
    it('writes only the image column and maps the row back', async () => {
      const url = 'https://cdn.test/object/public/product-images/products/uuid-1/img.png';
      update.mockResolvedValue({ ...persistedRow, imageUrl: url });

      const product = await repo.setImageUrl('uuid-1', url);

      expect(update).toHaveBeenCalledWith({ where: { id: 'uuid-1' }, data: { imageUrl: url } });
      expect(product?.imageUrl).toBe(url);
    });

    it('clears the image when given null', async () => {
      update.mockResolvedValue({ ...persistedRow, imageUrl: null });

      const product = await repo.setImageUrl('uuid-1', null);

      expect(update).toHaveBeenCalledWith({ where: { id: 'uuid-1' }, data: { imageUrl: null } });
      expect(product?.imageUrl).toBeNull();
    });

    // Honour the null contract so the use case raises a 404 instead of a 500.
    it('returns null on P2025 (no product with that id)', async () => {
      update.mockRejectedValue(knownError('P2025'));

      await expect(repo.setImageUrl('missing', 'https://cdn.test/x.png')).resolves.toBeNull();
    });

    it('rethrows any other Prisma error unchanged', async () => {
      const prismaError = knownError('P2002');
      update.mockRejectedValue(prismaError);

      await expect(repo.setImageUrl('uuid-1', 'https://cdn.test/x.png')).rejects.toBe(prismaError);
    });

    it('rethrows non-Prisma errors unchanged', async () => {
      const genericError = new Error('connection lost');
      update.mockRejectedValue(genericError);

      await expect(repo.setImageUrl('uuid-1', null)).rejects.toBe(genericError);
    });
  });

  describe('nullable image column', () => {
    it('maps a null image_url to a null entity field', async () => {
      findUnique.mockResolvedValue({ ...persistedRow, imageUrl: null });

      const product = await repo.findById('uuid-1');

      expect(product?.imageUrl).toBeNull();
    });

    it('creates a product without an image', async () => {
      create.mockResolvedValue({ ...persistedRow, imageUrl: null });

      const product = await repo.create({
        name: input.name,
        price: input.price,
        categoryId: input.categoryId,
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          name: input.name,
          description: undefined,
          basePrice: '12.50',
          categoryId: input.categoryId,
          imageUrl: undefined,
        },
      });
      expect(product.imageUrl).toBeNull();
    });
  });
});
