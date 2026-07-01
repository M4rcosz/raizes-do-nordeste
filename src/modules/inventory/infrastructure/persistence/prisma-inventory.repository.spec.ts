import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PrismaInventoryRepository } from './prisma-inventory.repository';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { InventoryTransactionType } from '@modules/inventory/domain/value-objects/inventory-transaction-type';
import { InsufficientStockError } from '@modules/inventory/domain/errors/insufficient-stock.error';
import { InventoryNotFoundError } from '@modules/inventory/domain/errors/inventory-not-found.error';

// Each delegate method is an async fn; `unknown` args/return keep the cast light while
// letting mockResolvedValue accept the raw Prisma rows.
type DelegateFn = jest.MockedFunction<(args?: unknown) => Promise<unknown>>;

type PrismaMock = {
  inventory: {
    findMany: DelegateFn;
    findUnique: DelegateFn;
    updateMany: DelegateFn;
  };
  inventoryTransaction: {
    create: DelegateFn;
  };
};

const delegateFn = (): DelegateFn => jest.fn() as DelegateFn;

const buildPrismaMock = (): PrismaMock => ({
  inventory: {
    findMany: delegateFn(),
    findUnique: delegateFn(),
    updateMany: delegateFn(),
  },
  inventoryTransaction: {
    create: delegateFn(),
  },
});

const rawInventory = {
  id: 'inv-1',
  businessUnitId: 'bu-1',
  productId: 'p-1',
  quantity: 8,
  minQuantity: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PrismaInventoryRepository', () => {
  let prisma: PrismaMock;
  let repo: PrismaInventoryRepository;

  beforeEach(() => {
    prisma = buildPrismaMock();
    repo = new PrismaInventoryRepository(prisma as unknown as PrismaService);
  });

  it('lists the unit inventory paginated, mapped to domain entities', async () => {
    prisma.inventory.findMany.mockResolvedValue([rawInventory]);

    const result = await repo.findManyByUnit({
      businessUnitId: 'bu-1',
      pagination: { take: 21 },
    });

    expect(prisma.inventory.findMany).toHaveBeenCalledWith({
      where: { businessUnitId: 'bu-1' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 21,
    });
    expect(result).toHaveLength(1);
    expect(result[0].productId).toBe('p-1');
    expect(result[0].quantity).toBe(8);
  });

  it('applies the cursor with skip:1 to start after the previous page', async () => {
    prisma.inventory.findMany.mockResolvedValue([rawInventory]);

    await repo.findManyByUnit({
      businessUnitId: 'bu-1',
      pagination: { take: 3, cursor: 'inv-0' },
    });

    expect(prisma.inventory.findMany).toHaveBeenCalledWith({
      where: { businessUnitId: 'bu-1' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 3,
      cursor: { id: 'inv-0' },
      skip: 1,
    });
  });

  describe('applyMovement', () => {
    it('guards an OUT with quantity >= amount and decrements atomically', async () => {
      prisma.inventory.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventory.findUnique.mockResolvedValue({ ...rawInventory, quantity: 6 });
      prisma.inventoryTransaction.create.mockResolvedValue({});

      const result = await repo.applyMovement(
        {
          businessUnitId: 'bu-1',
          productId: 'p-1',
          type: InventoryTransactionType.OUT,
          quantity: 2,
          reason: 'order',
          createdBy: 'u-1',
          orderId: 'o-1',
        },
        prisma,
      );

      expect(prisma.inventory.updateMany).toHaveBeenCalledWith({
        where: { businessUnitId: 'bu-1', productId: 'p-1', quantity: { gte: 2 } },
        data: { quantity: { decrement: 2 } },
      });
      expect(result.quantity).toBe(6);
    });

    it('records the InventoryTransaction with type, order and actor', async () => {
      prisma.inventory.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventory.findUnique.mockResolvedValue({ ...rawInventory, quantity: 6 });
      prisma.inventoryTransaction.create.mockResolvedValue({});

      await repo.applyMovement(
        {
          businessUnitId: 'bu-1',
          productId: 'p-1',
          type: InventoryTransactionType.OUT,
          quantity: 2,
          reason: 'Stock deducted for order o-1',
          createdBy: 'u-1',
          orderId: 'o-1',
        },
        prisma,
      );

      expect(prisma.inventoryTransaction.create).toHaveBeenCalledWith({
        data: {
          inventoryId: 'inv-1',
          orderId: 'o-1',
          createdBy: 'u-1',
          type: InventoryTransactionType.OUT,
          quantity: 2,
          reason: 'Stock deducted for order o-1',
        },
      });
    });

    it('increments on IN without the stock guard and records a null orderId', async () => {
      prisma.inventory.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventory.findUnique.mockResolvedValue({ ...rawInventory, quantity: 13 });
      prisma.inventoryTransaction.create.mockResolvedValue({});

      const result = await repo.applyMovement(
        {
          businessUnitId: 'bu-1',
          productId: 'p-1',
          type: InventoryTransactionType.IN,
          quantity: 5,
          reason: 'restock',
          createdBy: 'u-1',
        },
        prisma,
      );

      expect(prisma.inventory.updateMany).toHaveBeenCalledWith({
        where: { businessUnitId: 'bu-1', productId: 'p-1' },
        data: { quantity: { increment: 5 } },
      });
      expect(prisma.inventoryTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ orderId: null }),
      });
      expect(result.quantity).toBe(13);
    });

    it('throws InsufficientStockError when an OUT matches no row (low balance or no row)', async () => {
      prisma.inventory.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repo.applyMovement(
          {
            businessUnitId: 'bu-1',
            productId: 'p-1',
            type: InventoryTransactionType.OUT,
            quantity: 99,
            reason: 'order',
            createdBy: 'u-1',
          },
          prisma,
        ),
      ).rejects.toBeInstanceOf(InsufficientStockError);
      expect(prisma.inventoryTransaction.create).not.toHaveBeenCalled();
    });

    it('throws InventoryNotFoundError when an IN targets a product with no inventory row', async () => {
      prisma.inventory.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repo.applyMovement(
          {
            businessUnitId: 'bu-1',
            productId: 'p-x',
            type: InventoryTransactionType.IN,
            quantity: 5,
            reason: 'restock',
            createdBy: 'u-1',
          },
          prisma,
        ),
      ).rejects.toBeInstanceOf(InventoryNotFoundError);
      expect(prisma.inventoryTransaction.create).not.toHaveBeenCalled();
    });
  });
});
