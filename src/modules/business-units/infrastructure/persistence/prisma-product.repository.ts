import { Injectable } from '@nestjs/common';
import { Product as PrismaProduct, Prisma } from '@prisma/client';
import { Money } from '@shared/domain/value-objects/money';
import { InvalidMoneyError } from '@shared/errors/domain/invalid-money.error';
import { CorruptPersistedMoneyError } from '@shared/errors/infrastructure/corrupt-persisted-money.error';
import type {
  CreateProductInput,
  FindProductsByBusinessUnitInput,
  FindProductsInput,
  ProductRepository,
  ProductFilters,
} from '../../domain/repositories/product.repository';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { Product } from '../../domain/entities/product.entity';
import { ProductAlreadyExistsError } from '../../domain/errors/product-already-exists.error';
import { CategoryNotFoundError } from '../../domain/errors/category-not-found.error';

@Injectable()
export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Product | null> {
    const raw = await this.prisma.product.findUnique({ where: { id } });
    return raw ? this.toEntity(raw) : null;
  }

  async findAllActive(input: FindProductsInput): Promise<Product[]> {
    const { pagination, filters } = input;

    const raws = await this.prisma.product.findMany({
      where: {
        isActive: true,
        ...this.buildProductWhere(filters),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.take,
      ...(pagination.cursor && {
        cursor: { id: pagination.cursor },
        skip: 1,
      }),
    });

    return raws.map((raw) => this.toEntity(raw));
  }

  async findAllByBusinessUnit(input: FindProductsByBusinessUnitInput): Promise<Product[]> {
    const { businessUnitId, pagination, filters } = input;

    const items = await this.prisma.businessUnitMenuItem.findMany({
      where: {
        businessUnitId,
        isAvailable: true,
        product: this.buildProductWhere(filters),
      },
      include: { product: true },
      orderBy: [{ product: { createdAt: 'desc' } }, { productId: 'desc' }],
      take: pagination.take,
      ...(pagination.cursor && {
        cursor: {
          businessUnitId_productId: {
            businessUnitId,
            productId: pagination.cursor,
          },
        },
        skip: 1,
      }),
    });

    return items.map((item) => {
      const price = this.toMoney(item.customPrice ?? item.product.basePrice);
      return new Product(
        item.product.id,
        item.product.name,
        item.product.description,
        price,
        item.product.isActive,
        item.product.categoryId,
        item.product.createdAt,
        item.product.updatedAt,
        item.product.imageUrl,
      );
    });
  }

  async create(input: CreateProductInput): Promise<Product> {
    try {
      const created = await this.prisma.product.create({
        data: {
          name: input.name,
          description: input.description,
          basePrice: input.price,
          categoryId: input.categoryId,
          imageUrl: input.imageUrl,
        },
      });

      return this.toEntity(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new ProductAlreadyExistsError(`A product named "${input.name}" already exists.`, {
            cause: err,
          });
        }
        if (err.code === 'P2003') {
          throw new CategoryNotFoundError(`Category "${input.categoryId}" does not exist.`, {
            cause: err,
          });
        }
      }

      throw err;
    }
  }

  async update(product: Product): Promise<Product | null> {
    try {
      const updated = await this.prisma.product.update({
        where: { id: product.id },
        data: {
          name: product.name,
          description: product.description,
          // Money write-border: forward the 2dp decimal string, never a float.
          basePrice: product.price.toDecimalString(),
          categoryId: product.categoryId,
          imageUrl: product.imageUrl,
        },
      });

      return this.toEntity(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new ProductAlreadyExistsError(`A product named "${product.name}" already exists.`, {
            cause: err,
          });
        }
        if (err.code === 'P2003') {
          throw new CategoryNotFoundError(`Category "${product.categoryId}" does not exist.`, {
            cause: err,
          });
        }
        // P2025 when no product matches the id. Honor the null contract so the
        // use case raises ProductNotFoundError (404) instead of leaking a 500.
        if (err.code === 'P2025') {
          return null;
        }
      }

      throw err;
    }
  }

  async setActive(id: string, isActive: boolean): Promise<Product | null> {
    try {
      const updated = await this.prisma.product.update({
        where: { id },
        data: { isActive },
      });

      return this.toEntity(updated);
    } catch (err) {
      // P2025 when no product matches the id. Honor the null contract so the use
      // case raises ProductNotFoundError (404) instead of leaking a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }

  private buildProductWhere(filters?: ProductFilters): Prisma.ProductWhereInput {
    if (!filters) {
      return {};
    }
    const where: Prisma.ProductWhereInput = {};
    if (filters.search) {
      where.name = { contains: filters.search, mode: 'insensitive' };
    }
    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }
    return where;
  }

  private toEntity(raw: PrismaProduct): Product {
    return new Product(
      raw.id,
      raw.name,
      raw.description,
      this.toMoney(raw.basePrice),
      raw.isActive,
      raw.categoryId,
      raw.createdAt,
      raw.updatedAt,
      raw.imageUrl,
    );
  }

  // Read-path Money parse. A persisted value big.js rejects means corrupt DB data
  // (server fault), so we rethrow as infra error -> HTTP 500 generic, raw value
  // stays in the cause for logs only, never echoed to the client.
  private toMoney(raw: { toString(): string }): Money {
    try {
      return Money.fromDecimalString(raw.toString());
    } catch (err) {
      if (err instanceof InvalidMoneyError) {
        throw new CorruptPersistedMoneyError({ cause: err });
      }
      throw err;
    }
  }
}
