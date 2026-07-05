import { Injectable } from '@nestjs/common';
import { Category as PrismaCategory, Prisma } from '@prisma/client';
import type {
  CreateCategoryInput,
  FindCategoriesInput,
  CategoryRepository,
  CategoryFilters,
} from '../../domain/repositories/category.repository';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { Category } from '../../domain/entities/category.entity';
import { CategoryAlreadyExistsError } from '../../domain/errors/category-already-exists.error';

@Injectable()
export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Category | null> {
    const raw = await this.prisma.category.findUnique({ where: { id } });
    return raw ? this.toEntity(raw) : null;
  }

  async findAllActive(input: FindCategoriesInput): Promise<Category[]> {
    const { pagination, filters } = input;

    const raws = await this.prisma.category.findMany({
      where: {
        isActive: true,
        ...this.buildCategoryWhere(filters),
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

  async create(input: CreateCategoryInput): Promise<Category> {
    try {
      const created = await this.prisma.category.create({
        data: {
          name: input.name,
          description: input.description,
        },
      });

      return this.toEntity(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new CategoryAlreadyExistsError(`A category named "${input.name}" already exists.`, {
          cause: err,
        });
      }

      throw err;
    }
  }

  async update(category: Category): Promise<Category | null> {
    try {
      const updated = await this.prisma.category.update({
        where: { id: category.id },
        data: {
          name: category.name,
          description: category.description,
          isActive: category.isActive,
        },
      });

      return this.toEntity(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new CategoryAlreadyExistsError(
            `A category named "${category.name}" already exists.`,
            { cause: err },
          );
        }
        // P2025 when no category matches the id. Honor the null contract so the
        // use case raises CategoryNotFoundError (404) instead of leaking a 500.
        if (err.code === 'P2025') {
          return null;
        }
      }

      throw err;
    }
  }

  private buildCategoryWhere(filters?: CategoryFilters): Prisma.CategoryWhereInput {
    if (!filters) {
      return {};
    }
    const where: Prisma.CategoryWhereInput = {};
    if (filters.search) {
      where.name = { contains: filters.search, mode: 'insensitive' };
    }
    return where;
  }

  private toEntity(raw: PrismaCategory): Category {
    return new Category(
      raw.id,
      raw.name,
      raw.description,
      raw.isActive,
      raw.createdAt,
      raw.updatedAt,
    );
  }
}
