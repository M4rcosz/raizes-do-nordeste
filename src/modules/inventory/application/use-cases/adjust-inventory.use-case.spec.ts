import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AdjustInventoryUseCase } from './adjust-inventory.use-case';
import type { InventoryRepository } from '../../domain/repositories/inventory.repository';
import { Inventory } from '../../domain/entities/inventory.entity';
import { InventoryTransactionType } from '../../domain/value-objects/inventory-transaction-type';
import { InsufficientStockError } from '../../domain/errors/insufficient-stock.error';
import type { TransactionRunner } from '@shared/transaction/transaction-runner.port';

const TX = Symbol('tx');

describe('AdjustInventoryUseCase', () => {
  let applyMovement: jest.MockedFunction<InventoryRepository['applyMovement']>;
  let useCase: AdjustInventoryUseCase;

  const updated = new Inventory('inv-1', 'bu-1', 'p-1', 15, 2, new Date(), new Date());

  beforeEach(() => {
    applyMovement = jest.fn() as jest.MockedFunction<InventoryRepository['applyMovement']>;
    applyMovement.mockResolvedValue(updated);

    const repo: InventoryRepository = {
      findManyByUnit: jest.fn() as jest.MockedFunction<InventoryRepository['findManyByUnit']>,
      applyMovement,
    };
    // Fake unit of work: runs the work immediately, handing it a sentinel tx
    // so tests can assert the same context reaches the repository.
    const transactions: TransactionRunner = { run: (work) => work(TX) };

    useCase = new AdjustInventoryUseCase(repo, transactions);
  });

  it('applies the movement inside a transaction with the actor as createdBy', async () => {
    const result = await useCase.execute(
      {
        businessUnitId: 'bu-1',
        productId: 'p-1',
        type: InventoryTransactionType.IN,
        quantity: 5,
        reason: 'restock',
      },
      'manager-1',
    );

    expect(applyMovement).toHaveBeenCalledWith(
      {
        businessUnitId: 'bu-1',
        productId: 'p-1',
        type: InventoryTransactionType.IN,
        quantity: 5,
        reason: 'restock',
        createdBy: 'manager-1',
      },
      TX,
    );
    expect(result).toBe(updated);
  });

  it('propagates InsufficientStockError so the transaction rolls back', async () => {
    applyMovement.mockRejectedValue(new InsufficientStockError('not enough'));

    await expect(
      useCase.execute(
        {
          businessUnitId: 'bu-1',
          productId: 'p-1',
          type: InventoryTransactionType.OUT,
          quantity: 99,
          reason: 'spoilage',
        },
        'manager-1',
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });
});
