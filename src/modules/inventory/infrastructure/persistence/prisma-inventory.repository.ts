import { Injectable } from '@nestjs/common';
import { Prisma, type Inventory as InventoryModel } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { Inventory } from '@modules/inventory/domain/entities/inventory.entity';
import {
  ApplyMovementInput,
  FindInventoryByUnitInput,
  InventoryRepository,
} from '@modules/inventory/domain/repositories/inventory.repository';
import { InventoryTransactionType } from '@modules/inventory/domain/value-objects/inventory-transaction-type';
import { InsufficientStockError } from '@modules/inventory/domain/errors/insufficient-stock.error';
import { InventoryNotFoundError } from '@modules/inventory/domain/errors/inventory-not-found.error';

@Injectable()
export class PrismaInventoryRepository implements InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findManyByUnit(input: FindInventoryByUnitInput): Promise<Inventory[]> {
    const { businessUnitId, pagination } = input;

    // Stable order for cursoring: createdAt then id as the tiebreaker. The cursor
    // is the last item's id; skip:1 starts the next page after it.
    const raws = await this.prisma.inventory.findMany({
      where: { businessUnitId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: pagination.take,
      ...(pagination.cursor && {
        cursor: { id: pagination.cursor },
        skip: 1,
      }),
    });
    return raws.map((raw) => this.toEntity(raw));
  }

  async applyMovement(input: ApplyMovementInput, tx: TransactionContext): Promise<Inventory> {
    const db = tx as Prisma.TransactionClient;
    const isOut = input.type === InventoryTransactionType.OUT;

    // Guarded atomic update: an OUT only lands while the row still holds enough
    // stock (quantity >= amount in the WHERE), so concurrent movements can never
    // drive the balance below zero. count === 0 means not enough stock or no row.
    const { count } = await db.inventory.updateMany({
      where: {
        businessUnitId: input.businessUnitId,
        productId: input.productId,
        ...(isOut && { quantity: { gte: input.quantity } }),
      },
      data: { quantity: isOut ? { decrement: input.quantity } : { increment: input.quantity } },
    });

    if (count === 0) {
      if (isOut) {
        throw new InsufficientStockError(
          `Not enough stock of product ${input.productId} at this business unit.`,
        );
      }
      throw new InventoryNotFoundError(
        `Product ${input.productId} has no inventory at this business unit.`,
      );
    }

    const raw = await db.inventory.findUnique({
      where: {
        businessUnitId_productId: {
          businessUnitId: input.businessUnitId,
          productId: input.productId,
        },
      },
    });
    // Vanished between the update and the re-read (delete race).
    if (!raw) {
      throw new InventoryNotFoundError(
        `Inventory of product ${input.productId} was removed concurrently.`,
      );
    }

    await db.inventoryTransaction.create({
      data: {
        inventoryId: raw.id,
        orderId: input.orderId ?? null,
        createdBy: input.createdBy,
        type: input.type,
        quantity: input.quantity,
        reason: input.reason,
      },
    });

    return this.toEntity(raw);
  }

  private toEntity(raw: InventoryModel): Inventory {
    return new Inventory(
      raw.id,
      raw.businessUnitId,
      raw.productId,
      raw.quantity,
      raw.minQuantity,
      raw.createdAt,
      raw.updatedAt,
    );
  }
}
