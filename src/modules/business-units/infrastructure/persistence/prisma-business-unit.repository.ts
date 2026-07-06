import { Injectable } from '@nestjs/common';
import { BusinessUnit as PrismaBusinessUnit, Prisma } from '@prisma/client';
import type {
  CreateBusinessUnitInput,
  FindBusinessUnitsInput,
  BusinessUnitRepository,
  BusinessUnitFilters,
} from '../../domain/repositories/business-unit.repository';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { BusinessUnit } from '../../domain/entities/business-unit.entity';
import { BusinessUnitAlreadyExistsError } from '../../domain/errors/business-unit-already-exists.error';

@Injectable()
export class PrismaBusinessUnitRepository implements BusinessUnitRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<BusinessUnit | null> {
    const raw = await this.prisma.businessUnit.findUnique({ where: { id } });
    return raw ? this.toEntity(raw) : null;
  }

  async findMany(input: FindBusinessUnitsInput): Promise<BusinessUnit[]> {
    const { pagination, filters } = input;

    const raws = await this.prisma.businessUnit.findMany({
      where: this.buildWhere(filters),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.take,
      ...(pagination.cursor && {
        cursor: { id: pagination.cursor },
        skip: 1,
      }),
    });

    return raws.map((raw) => this.toEntity(raw));
  }

  async create(input: CreateBusinessUnitInput): Promise<BusinessUnit> {
    try {
      const created = await this.prisma.businessUnit.create({
        data: {
          name: input.name,
          cnpj: input.cnpj,
          address: input.address,
          city: input.city,
          phone: input.phone,
        },
      });

      return this.toEntity(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const field = this.conflictingField(err);
        throw new BusinessUnitAlreadyExistsError(
          `A business unit with ${field} "${input[field]}" already exists.`,
          { cause: err },
        );
      }

      throw err;
    }
  }

  async update(unit: BusinessUnit): Promise<BusinessUnit | null> {
    try {
      const updated = await this.prisma.businessUnit.update({
        where: { id: unit.id },
        data: {
          name: unit.name,
          address: unit.address,
          city: unit.city,
          phone: unit.phone,
        },
      });

      return this.toEntity(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // cnpj is immutable through this path, so in practice only phone can
        // clash, but the resolver is shared with create() and stays generic.
        if (err.code === 'P2002') {
          const field = this.conflictingField(err);
          throw new BusinessUnitAlreadyExistsError(
            `A business unit with ${field} "${unit[field]}" already exists.`,
            { cause: err },
          );
        }
        // P2025 when no unit matches the id. Honor the null contract so the use
        // case raises BusinessUnitNotFoundError (404) instead of leaking a 500.
        if (err.code === 'P2025') {
          return null;
        }
      }

      throw err;
    }
  }

  async setActive(id: string, isActive: boolean): Promise<BusinessUnit | null> {
    try {
      const updated = await this.prisma.businessUnit.update({
        where: { id },
        data: { isActive },
      });

      return this.toEntity(updated);
    } catch (err) {
      // P2025 when no unit matches the id. Honor the null contract so the use case
      // raises BusinessUnitNotFoundError (404) instead of leaking a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }

  // Resolves which unique field tripped P2002. Prisma reports it in meta.target,
  // which is string[] on Postgres but typed loosely, so we narrow defensively.
  private conflictingField(err: Prisma.PrismaClientKnownRequestError): 'cnpj' | 'phone' {
    const target = err.meta?.target;
    const fields = Array.isArray(target) ? target.map(String) : [String(target)];
    return fields.includes('phone') ? 'phone' : 'cnpj';
  }

  private buildWhere(filters?: BusinessUnitFilters): Prisma.BusinessUnitWhereInput {
    if (!filters) {
      return {};
    }
    const where: Prisma.BusinessUnitWhereInput = {};
    if (filters.search) {
      where.name = { contains: filters.search, mode: 'insensitive' };
    }
    if (filters.city) {
      where.city = filters.city;
    }
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    return where;
  }

  private toEntity(raw: PrismaBusinessUnit): BusinessUnit {
    return new BusinessUnit(
      raw.id,
      raw.name,
      raw.cnpj,
      raw.address,
      raw.city,
      raw.phone,
      raw.isActive,
      raw.createdAt,
      raw.updatedAt,
    );
  }
}
