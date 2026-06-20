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

type ProductCreateFn = (args: unknown) => Promise<PrismaProduct>;
type ProductFindUniqueFn = (args: unknown) => Promise<PrismaProduct | null>;

const knownError = (code: string): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: '7.7.0',
    meta: { target: ['name'] },
  });

describe('PrismaProductRepository', () => {
  let create: jest.MockedFunction<ProductCreateFn>;
  let findUnique: jest.MockedFunction<ProductFindUniqueFn>;
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
    const prisma = { product: { create, findUnique } } as unknown as PrismaService;
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
  });
});
