import { Injectable } from '@nestjs/common';
import { Prisma, type Inventory as InventoryModel } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { Inventory } from '@modules/inventory/domain/entities/inventory.entity';
import {
  ApplyMovementInput,
  FindInventoryByUnitInput,
  InitializeInventoryInput,
  InventoryRepository,
} from '@modules/inventory/domain/repositories/inventory.repository';
import { InventoryTransactionType } from '@modules/inventory/domain/value-objects/inventory-transaction-type';
import { MAX_INVENTORY_QUANTITY } from '@modules/inventory/domain/value-objects/inventory-quantity';
import { InsufficientStockError } from '@modules/inventory/domain/errors/insufficient-stock.error';
import { InventoryNotFoundError } from '@modules/inventory/domain/errors/inventory-not-found.error';
import { InventoryQuantityOverflowError } from '@modules/inventory/domain/errors/inventory-quantity-overflow.error';
import { InventoryAlreadyExistsError } from '@modules/inventory/domain/errors/inventory-already-exists.error';
import { InventoryProductNotFoundError } from '@modules/inventory/domain/errors/inventory-product-not-found.error';

@Injectable()
export class PrismaInventoryRepository implements InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findManyByUnit(input: FindInventoryByUnitInput): Promise<Inventory[]> {
    const { businessUnitId, take, keyset } = input;

    // Keyset on (createdAt asc, id asc). Ascending, so the predicate seeks GREATER
    // values - the mirror of the descending listings. Compares values rather than
    // locating a row, so a deleted keyset row cannot break the next page.
    const raws = await this.prisma.inventory.findMany({
      where: {
        businessUnitId,
        ...(keyset && {
          OR: [
            { createdAt: { gt: keyset.timestamp } },
            { createdAt: keyset.timestamp, id: { gt: keyset.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
    });
    return raws.map((raw) => this.toEntity(raw));
  }

  async applyMovement(input: ApplyMovementInput, tx: TransactionContext): Promise<Inventory> {
    const db = tx as Prisma.TransactionClient;
    const isOut = input.type === InventoryTransactionType.OUT;

    // Guarded atomic update, both ends of the int4 range. An OUT only lands while
    // the row still holds enough stock (quantity >= amount); an IN only lands
    // while the result still fits (quantity <= MAX - amount). Both guards live in
    // the WHERE, so concurrent movements can never drive the balance below zero
    // nor past int4 - a check-then-update would race.
    const { count } = await db.inventory.updateMany({
      where: {
        businessUnitId: input.businessUnitId,
        productId: input.productId,
        ...(isOut
          ? { quantity: { gte: input.quantity } }
          : { quantity: { lte: MAX_INVENTORY_QUANTITY - input.quantity } }),
      },
      data: { quantity: isOut ? { decrement: input.quantity } : { increment: input.quantity } },
    });

    if (count === 0) {
      if (isOut) {
        throw new InsufficientStockError(
          `Not enough stock of product ${input.productId} at this business unit.`,
        );
      }
      // An IN misses for two different reasons now, so ask which one it was. A
      // missing row is 404; an existing row that cannot absorb the units is 422.
      // This read is a second statement, so a concurrent commit between it and the
      // update can flip which of the two we report. Only the message is affected -
      // the balance guard is in the WHERE above and stays race-free either way.
      const existing = await db.inventory.findUnique({
        where: {
          businessUnitId_productId: {
            businessUnitId: input.businessUnitId,
            productId: input.productId,
          },
        },
      });
      if (existing) {
        throw new InventoryQuantityOverflowError(
          `Adding ${input.quantity} units would push product ${input.productId} past the maximum stock of ${MAX_INVENTORY_QUANTITY}.`,
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

  async initialize(input: InitializeInventoryInput, tx: TransactionContext): Promise<Inventory> {
    const db = tx as Prisma.TransactionClient;

    // Only the row insert is wrapped. The ledger insert below carries its own FK
    // (createdBy -> users), and a P2003 from it means the actor vanished, not that
    // the product is missing - catching both here would report that as a 404 about
    // the product. An absent actor is a server-side inconsistency: let it surface.
    let raw;
    try {
      raw = await db.inventory.create({
        data: {
          businessUnitId: input.businessUnitId,
          productId: input.productId,
          quantity: input.quantity,
          minQuantity: input.minQuantity,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Unique (businessUnitId, productId): the row already exists.
        if (err.code === 'P2002') {
          throw new InventoryAlreadyExistsError(
            `Product ${input.productId} already has inventory at this business unit.`,
            { cause: err },
          );
        }
        // FK violation: productId or businessUnitId does not reference an existing row.
        if (err.code === 'P2003') {
          throw new InventoryProductNotFoundError(
            `Product ${input.productId} or business unit ${input.businessUnitId} does not exist.`,
            { cause: err },
          );
        }
      }
      throw err;
    }

    // Written unconditionally, including a zero opening balance. The balance derives
    // from the ledger, so a row with no entry has no genesis: nothing records who
    // seeded it or why. A zero-quantity IN keeps the sum right and the provenance.
    await db.inventoryTransaction.create({
      data: {
        inventoryId: raw.id,
        orderId: null,
        createdBy: input.createdBy,
        type: InventoryTransactionType.IN,
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
