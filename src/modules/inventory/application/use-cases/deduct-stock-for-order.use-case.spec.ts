import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DeductStockForOrderUseCase } from './deduct-stock-for-order.use-case';
import type { InventoryRepository } from '../../domain/repositories/inventory.repository';
import { Inventory } from '../../domain/entities/inventory.entity';
import { InventoryTransactionType } from '../../domain/value-objects/inventory-transaction-type';
import { InsufficientStockError } from '../../domain/errors/insufficient-stock.error';

const TX = Symbol('tx');

const buildInventory = (productId: string, quantity: number, minQuantity: number): Inventory =>
  new Inventory(
    `inv-${productId}`,
    'bu-1',
    productId,
    quantity,
    minQuantity,
    new Date(),
    new Date(),
  );

describe('DeductStockForOrderUseCase', () => {
  let applyMovement: jest.MockedFunction<InventoryRepository['applyMovement']>;
  let useCase: DeductStockForOrderUseCase;

  beforeEach(() => {
    applyMovement = jest.fn() as jest.MockedFunction<InventoryRepository['applyMovement']>;
    const repo: InventoryRepository = {
      findManyByUnit: jest.fn() as jest.MockedFunction<InventoryRepository['findManyByUnit']>,
      applyMovement,
    };
    useCase = new DeductStockForOrderUseCase(repo);
  });

  it('applies one OUT movement per item, linked to the order and the caller tx', async () => {
    applyMovement
      .mockResolvedValueOnce(buildInventory('p-1', 8, 2))
      .mockResolvedValueOnce(buildInventory('p-2', 30, 5));

    const result = await useCase.deductForOrder(
      {
        businessUnitId: 'bu-1',
        orderId: 'o-1',
        actorId: 'u-1',
        items: [
          { productId: 'p-1', quantity: 2 },
          { productId: 'p-2', quantity: 1 },
        ],
      },
      TX,
    );

    expect(applyMovement).toHaveBeenCalledTimes(2);
    expect(applyMovement).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        businessUnitId: 'bu-1',
        productId: 'p-1',
        type: InventoryTransactionType.OUT,
        quantity: 2,
        orderId: 'o-1',
        createdBy: 'u-1',
      }),
      TX,
    );
    expect(result.lowStock).toEqual([]);
  });

  it('collapses repeated products into one OUT for the summed quantity', async () => {
    applyMovement.mockResolvedValueOnce(buildInventory('p-1', 7, 5));

    const result = await useCase.deductForOrder(
      {
        businessUnitId: 'bu-1',
        orderId: 'o-1',
        actorId: 'u-1',
        items: [
          { productId: 'p-1', quantity: 2 },
          { productId: 'p-1', quantity: 1 },
        ],
      },
      TX,
    );

    expect(applyMovement).toHaveBeenCalledTimes(1);
    expect(applyMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'p-1',
        quantity: 3,
        type: InventoryTransactionType.OUT,
      }),
      TX,
    );
    expect(result.lowStock).toEqual([]);
  });

  it('collects every item the deduction left at or below minQuantity', async () => {
    applyMovement
      .mockResolvedValueOnce(buildInventory('p-1', 2, 5))
      .mockResolvedValueOnce(buildInventory('p-2', 30, 5))
      .mockResolvedValueOnce(buildInventory('p-3', 5, 5));

    const result = await useCase.deductForOrder(
      {
        businessUnitId: 'bu-1',
        orderId: 'o-1',
        actorId: 'u-1',
        items: [
          { productId: 'p-1', quantity: 1 },
          { productId: 'p-2', quantity: 1 },
          { productId: 'p-3', quantity: 1 },
        ],
      },
      TX,
    );

    expect(result.lowStock).toEqual([
      { productId: 'p-1', quantity: 2, minQuantity: 5 },
      { productId: 'p-3', quantity: 5, minQuantity: 5 },
    ]);
  });

  it('propagates InsufficientStockError from any item (caller tx rolls everything back)', async () => {
    applyMovement
      .mockResolvedValueOnce(buildInventory('p-1', 8, 2))
      .mockRejectedValueOnce(new InsufficientStockError('not enough'));

    await expect(
      useCase.deductForOrder(
        {
          businessUnitId: 'bu-1',
          orderId: 'o-1',
          actorId: 'u-1',
          items: [
            { productId: 'p-1', quantity: 1 },
            { productId: 'p-2', quantity: 99 },
          ],
        },
        TX,
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });
});
