import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { GetInventoryUseCase } from './get-inventory.use-case';
import type { InventoryRepository } from '../../domain/repositories/inventory.repository';
import { Inventory } from '../../domain/entities/inventory.entity';
import { InventoryFetchError } from '../errors/inventory-fetch.error';

describe('GetInventoryUseCase', () => {
  let findByUnit: jest.MockedFunction<InventoryRepository['findByUnit']>;
  let useCase: GetInventoryUseCase;

  beforeEach(() => {
    findByUnit = jest.fn() as jest.MockedFunction<InventoryRepository['findByUnit']>;
    const repo: InventoryRepository = {
      findByUnit,
      applyMovement: jest.fn() as jest.MockedFunction<InventoryRepository['applyMovement']>,
    };
    useCase = new GetInventoryUseCase(repo);
  });

  it('returns the unit inventory from the repository', async () => {
    const rows = [new Inventory('inv-1', 'bu-1', 'p-1', 10, 2, new Date(), new Date())];
    findByUnit.mockResolvedValue(rows);

    await expect(useCase.execute('bu-1')).resolves.toBe(rows);
    expect(findByUnit).toHaveBeenCalledWith('bu-1');
  });

  it('wraps persistence failures in InventoryFetchError with the cause chained', async () => {
    const boom = new Error('db down');
    findByUnit.mockRejectedValue(boom);

    const err: unknown = await useCase.execute('bu-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InventoryFetchError);
    expect((err as Error).cause).toBe(boom);
  });
});
