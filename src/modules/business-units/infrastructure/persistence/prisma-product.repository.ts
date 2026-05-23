import { Injectable } from '@nestjs/common';
import { Product as PrismaProduct, Prisma } from '@prisma/client';
import Big from 'big.js';
import type {
  CreateProductInput,
  FindProductsByBusinessUnitInput,
  FindProductsInput,
  IProductRepository,
  ProductFilters,
} from '../../domain/repositories/product.repository';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { Product } from '../../domain/entities/product.entity';
import { ProductAlreadyExistsError } from '../../domain/errors/product-already-exists.error';
import { CategoryNotFoundError } from '../../domain/errors/category-not-found.error';

@Injectable()
export class PrismaProductRepository implements IProductRepository {
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
      const price = new Big((item.customPrice ?? item.product.basePrice).toString());
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
      new Big(raw.basePrice.toString()),
      raw.isActive,
      raw.categoryId,
      raw.createdAt,
      raw.updatedAt,
      raw.imageUrl,
    );
  }
}
