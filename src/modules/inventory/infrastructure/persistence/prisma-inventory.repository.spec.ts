import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PrismaInventoryRepository } from './prisma-inventory.repository';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { InventoryTransactionType } from '@modules/inventory/domain/value-objects/inventory-transaction-type';
import { InsufficientStockError } from '@modules/inventory/domain/errors/insufficient-stock.error';
import { InventoryNotFoundError } from '@modules/inventory/domain/errors/inventory-not-found.error';
import { InventoryAlreadyExistsError } from '@modules/inventory/domain/errors/inventory-already-exists.error';
import { InventoryProductNotFoundError } from '@modules/inventory/domain/errors/inventory-product-not-found.error';
import { InventoryQuantityOverflowError } from '@modules/inventory/domain/errors/inventory-quantity-overflow.error';
import { MAX_INVENTORY_QUANTITY } from '@modules/inventory/domain/value-objects/inventory-quantity';
import { Prisma } from '@prisma/client';
import { knownRequestError } from '@shared/infrastructure/prisma/testing/prisma-mock';

// Each delegate method is an async fn; `unknown` args/return keep the cast light while
// letting mockResolvedValue accept the raw Prisma rows.
type DelegateFn = jest.MockedFunction<(args?: unknown) => Promise<unknown>>;

type PrismaMock = {
  inventory: {
    findMany: DelegateFn;
    findUnique: DelegateFn;
    updateMany: DelegateFn;
    create: DelegateFn;
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
    create: delegateFn(),
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

    it('guards an IN with quantity <= max - amount and records a null orderId', async () => {
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
        where: {
          businessUnitId: 'bu-1',
          productId: 'p-1',
          quantity: { lte: MAX_INVENTORY_QUANTITY - 5 },
        },
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
      // The row is absent, so the miss was a missing row and not an overflow.
      prisma.inventory.findUnique.mockResolvedValue(null);

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

    it('throws InventoryQuantityOverflowError when an IN would push the row past int4', async () => {
      // The guarded update matched nothing, but the row exists: it cannot absorb
      // the units. Distinguishes 422 from the 404 above.
      prisma.inventory.updateMany.mockResolvedValue({ count: 0 });
      prisma.inventory.findUnique.mockResolvedValue({
        ...rawInventory,
        quantity: MAX_INVENTORY_QUANTITY - 1,
      });

      await expect(
        repo.applyMovement(
          {
            businessUnitId: 'bu-1',
            productId: 'p-1',
            type: InventoryTransactionType.IN,
            quantity: 5,
            reason: 'restock',
            createdBy: 'u-1',
          },
          prisma,
        ),
      ).rejects.toBeInstanceOf(InventoryQuantityOverflowError);
      expect(prisma.inventoryTransaction.create).not.toHaveBeenCalled();
    });

    it('allows an IN that lands exactly on the maximum', async () => {
      prisma.inventory.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventory.findUnique.mockResolvedValue({
        ...rawInventory,
        quantity: MAX_INVENTORY_QUANTITY,
      });
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

      expect(result.quantity).toBe(MAX_INVENTORY_QUANTITY);
    });
  });

  describe('initialize', () => {
    const knownError = (code: string): Prisma.PrismaClientKnownRequestError =>
      knownRequestError(code);

    it('creates the row and writes an opening IN ledger entry', async () => {
      prisma.inventory.create.mockResolvedValue({ ...rawInventory, quantity: 10 });
      prisma.inventoryTransaction.create.mockResolvedValue({});

      const result = await repo.initialize(
        {
          businessUnitId: 'bu-1',
          productId: 'p-1',
          quantity: 10,
          minQuantity: 2,
          reason: 'opening stock',
          createdBy: 'u-1',
        },
        prisma,
      );

      expect(prisma.inventory.create).toHaveBeenCalledWith({
        data: { businessUnitId: 'bu-1', productId: 'p-1', quantity: 10, minQuantity: 2 },
      });
      expect(prisma.inventoryTransaction.create).toHaveBeenCalledWith({
        data: {
          inventoryId: 'inv-1',
          orderId: null,
          createdBy: 'u-1',
          type: InventoryTransactionType.IN,
          quantity: 10,
          reason: 'opening stock',
        },
      });
      expect(result.quantity).toBe(10);
    });

    it('still writes a genesis ledger entry when the opening balance is zero', async () => {
      // The row would otherwise have no record of who seeded it, and the caller's
      // required `reason` would be silently discarded.
      prisma.inventory.create.mockResolvedValue({ ...rawInventory, quantity: 0 });
      prisma.inventoryTransaction.create.mockResolvedValue({});

      const result = await repo.initialize(
        {
          businessUnitId: 'bu-1',
          productId: 'p-1',
          quantity: 0,
          minQuantity: 2,
          reason: 'opening stock',
          createdBy: 'u-1',
        },
        prisma,
      );

      expect(prisma.inventoryTransaction.create).toHaveBeenCalledWith({
        data: {
          inventoryId: 'inv-1',
          orderId: null,
          createdBy: 'u-1',
          type: InventoryTransactionType.IN,
          quantity: 0,
          reason: 'opening stock',
        },
      });
      expect(result.quantity).toBe(0);
    });

    it('maps a P2002 unique violation to InventoryAlreadyExistsError', async () => {
      prisma.inventory.create.mockRejectedValue(knownError('P2002'));

      await expect(
        repo.initialize(
          {
            businessUnitId: 'bu-1',
            productId: 'p-1',
            quantity: 10,
            minQuantity: 2,
            reason: 'opening stock',
            createdBy: 'u-1',
          },
          prisma,
        ),
      ).rejects.toBeInstanceOf(InventoryAlreadyExistsError);
    });

    it('maps a P2003 FK violation to InventoryProductNotFoundError', async () => {
      prisma.inventory.create.mockRejectedValue(knownError('P2003'));

      await expect(
        repo.initialize(
          {
            businessUnitId: 'bu-1',
            productId: 'p-x',
            quantity: 10,
            minQuantity: 2,
            reason: 'opening stock',
            createdBy: 'u-1',
          },
          prisma,
        ),
      ).rejects.toBeInstanceOf(InventoryProductNotFoundError);
    });

    it('does not blame the product for a P2003 raised by the ledger insert', async () => {
      // The ledger has its own FK (createdBy -> users). A violation there means the
      // actor vanished, not that the product is missing, so it must not be mapped to
      // InventoryProductNotFoundError (a 404 pointing at the wrong resource).
      prisma.inventory.create.mockResolvedValue({ ...rawInventory, quantity: 10 });
      prisma.inventoryTransaction.create.mockRejectedValue(knownError('P2003'));

      const attempt = repo.initialize(
        {
          businessUnitId: 'bu-1',
          productId: 'p-1',
          quantity: 10,
          minQuantity: 2,
          reason: 'opening stock',
          createdBy: 'ghost-user',
        },
        prisma,
      );

      await expect(attempt).rejects.not.toBeInstanceOf(InventoryProductNotFoundError);
      // Assert the exact escape hatch, so this cannot pass vacuously on some other error.
      await expect(attempt).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    });
  });
});
