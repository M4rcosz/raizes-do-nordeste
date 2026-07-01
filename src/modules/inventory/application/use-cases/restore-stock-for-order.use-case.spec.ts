import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RestoreStockForOrderUseCase } from './restore-stock-for-order.use-case';
import type { InventoryRepository } from '../../domain/repositories/inventory.repository';
import { InventoryTransactionType } from '../../domain/value-objects/inventory-transaction-type';
import { Inventory } from '../../domain/entities/inventory.entity';

const tx = Symbol('tx');
const inventoryRow = (): Inventory =>
  new Inventory('inv-1', 'bu-1', 'p-1', 10, 2, new Date(), new Date());

describe('RestoreStockForOrderUseCase', () => {
  let applyMovement: jest.MockedFunction<InventoryRepository['applyMovement']>;
  let useCase: RestoreStockForOrderUseCase;

  beforeEach(() => {
    applyMovement = jest.fn() as jest.MockedFunction<InventoryRepository['applyMovement']>;
    applyMovement.mockResolvedValue(inventoryRow());
    const repo = {
      findManyByUnit: jest.fn() as jest.MockedFunction<InventoryRepository['findManyByUnit']>,
      applyMovement,
    };
    useCase = new RestoreStockForOrderUseCase(repo);
  });

  it('applies one guarded IN movement per product, linked to the order', async () => {
    await useCase.restoreForOrder(
      {
        businessUnitId: 'bu-1',
        orderId: 'o-1',
        actorId: 'u-1',
        items: [{ productId: 'p-1', quantity: 2 }],
      },
      tx,
    );

    expect(applyMovement).toHaveBeenCalledWith(
      {
        businessUnitId: 'bu-1',
        productId: 'p-1',
        type: InventoryTransactionType.IN,
        quantity: 2,
        reason: 'Stock restored for cancelled order o-1',
        createdBy: 'u-1',
        orderId: 'o-1',
      },
      tx,
    );
  });

  it('collapses repeated product lines into a single IN', async () => {
    await useCase.restoreForOrder(
      {
        businessUnitId: 'bu-1',
        orderId: 'o-1',
        actorId: 'u-1',
        items: [
          { productId: 'p-1', quantity: 2 },
          { productId: 'p-1', quantity: 1 },
        ],
      },
      tx,
    );

    expect(applyMovement).toHaveBeenCalledTimes(1);
    expect(applyMovement).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'p-1', quantity: 3, type: InventoryTransactionType.IN }),
      tx,
    );
  });
});
