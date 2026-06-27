import { Injectable } from '@nestjs/common';
import {
  BusinessUnitMenuItem as PrismaMenuItem,
  Product as PrismaProduct,
  Prisma,
} from '@prisma/client';
import { Money } from '@shared/domain/value-objects/money';
import { InvalidMoneyError } from '@shared/errors/domain/invalid-money.error';
import { CorruptPersistedMoneyError } from '@shared/errors/infrastructure/corrupt-persisted-money.error';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import type {
  CreateMenuItemInput,
  FindMenuItemsByBusinessUnitInput,
  MenuItemRepository,
  MenuItemWithProduct,
  UpdateMenuItemInput,
} from '../../domain/repositories/menu-item.repository';
import { MenuItem } from '../../domain/entities/menu-item.entity';
import { MenuItemAlreadyExistsError } from '../../domain/errors/menu-item-already-exists.error';
import { BusinessUnitNotFoundError } from '../../application/errors/business-unit-not-found.error';
import { ProductNotFoundError } from '../../application/errors/product-not-found.error';

type MenuItemWithProductRow = PrismaMenuItem & { product: PrismaProduct };

@Injectable()
export class PrismaMenuItemRepository implements MenuItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAvailableById(
    menuItemId: string,
    businessUnitId: string,
  ): Promise<MenuItemWithProduct | null> {
    const row = await this.prisma.businessUnitMenuItem.findFirst({
      where: {
        id: menuItemId,
        businessUnitId,
        isAvailable: true,
        product: { isActive: true },
        businessUnit: { isActive: true },
      },
      include: { product: true },
    });

    return row ? this.toReadModel(row) : null;
  }

  async findAllByBusinessUnit(
    input: FindMenuItemsByBusinessUnitInput,
  ): Promise<MenuItemWithProduct[]> {
    const { businessUnitId, pagination, includeUnavailable } = input;

    const rows = await this.prisma.businessUnitMenuItem.findMany({
      where: {
        businessUnitId,
        ...(includeUnavailable
          ? {}
          : {
              isAvailable: true,
              product: { isActive: true },
              businessUnit: { isActive: true },
            }),
      },
      include: { product: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.take,
      ...(pagination.cursor && {
        cursor: { id: pagination.cursor },
        skip: 1,
      }),
    });

    return rows.map((row) => this.toReadModel(row));
  }

  async create(input: CreateMenuItemInput): Promise<MenuItem> {
    try {
      const created = await this.prisma.businessUnitMenuItem.create({
        data: {
          businessUnitId: input.businessUnitId,
          productId: input.productId,
          customPrice: input.customPrice,
          ...(input.isAvailable !== undefined && { isAvailable: input.isAvailable }),
        },
      });

      return this.toEntity(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new MenuItemAlreadyExistsError(
            `Product "${input.productId}" is already on the menu of business unit "${input.businessUnitId}".`,
            { cause: err },
          );
        }
        if (err.code === 'P2003') {
          throw this.foreignKeyError(input, err);
        }
      }

      throw err;
    }
  }

  async update(input: UpdateMenuItemInput): Promise<MenuItem | null> {
    // Scope the lookup to the owning unit so a guessed id from another unit
    // cannot be patched through this unit's route.
    const existing = await this.prisma.businessUnitMenuItem.findFirst({
      where: { id: input.id, businessUnitId: input.businessUnitId },
      select: { id: true },
    });

    if (!existing) {
      return null;
    }

    try {
      const updated = await this.prisma.businessUnitMenuItem.update({
        where: { id: input.id },
        data: {
          ...(input.customPrice !== undefined && { customPrice: input.customPrice }),
          ...(input.isAvailable !== undefined && { isAvailable: input.isAvailable }),
        },
      });

      return this.toEntity(updated);
    } catch (err) {
      // P2025 when the row is removed between the scoped lookup and the update.
      // Honor the null contract so the use case raises MenuItemNotFoundError (404)
      // instead of leaking a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }

  // P2003 can fire on either foreign key. Use the constraint detail to point at
  // the missing side, defaulting to the business unit when it is ambiguous.
  private foreignKeyError(
    input: CreateMenuItemInput,
    err: Prisma.PrismaClientKnownRequestError,
  ): BusinessUnitNotFoundError | ProductNotFoundError {
    const detail = this.foreignKeyDetail(err);
    if (detail.includes('product')) {
      return new ProductNotFoundError(`Product "${input.productId}" does not exist.`, {
        cause: err,
      });
    }
    return new BusinessUnitNotFoundError(
      `Business unit "${input.businessUnitId}" does not exist.`,
      { cause: err },
    );
  }

  private foreignKeyDetail(err: Prisma.PrismaClientKnownRequestError): string {
    const meta = err.meta;
    if (meta && typeof meta === 'object') {
      const record = meta;
      const candidate = record.field_name ?? record.constraint ?? record.target;
      if (typeof candidate === 'string') {
        return candidate.toLowerCase();
      }
    }
    return '';
  }

  private toReadModel(row: MenuItemWithProductRow): MenuItemWithProduct {
    return {
      menuItem: this.toEntity(row),
      product: {
        id: row.product.id,
        name: row.product.name,
        description: row.product.description,
        imageUrl: row.product.imageUrl,
      },
    };
  }

  private toEntity(raw: PrismaMenuItem): MenuItem {
    return new MenuItem(
      raw.id,
      raw.businessUnitId,
      raw.productId,
      this.toMoney(raw.customPrice),
      raw.isAvailable,
      raw.createdAt,
      raw.updatedAt,
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
