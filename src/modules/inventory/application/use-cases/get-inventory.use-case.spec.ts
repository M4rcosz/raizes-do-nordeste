import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { GetInventoryUseCase } from './get-inventory.use-case';
import type { InventoryRepository } from '../../domain/repositories/inventory.repository';
import { Inventory } from '../../domain/entities/inventory.entity';
import { InventoryFetchError } from '../errors/inventory-fetch.error';
import { encodeInventoryCursor } from '../inventory-keyset-cursor';

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

const row = (id: string): Inventory =>
  new Inventory(id, 'bu-1', `p-${id}`, 10, 2, CREATED_AT, CREATED_AT);

describe('GetInventoryUseCase', () => {
  let findManyByUnit: jest.MockedFunction<InventoryRepository['findManyByUnit']>;
  let useCase: GetInventoryUseCase;

  beforeEach(() => {
    findManyByUnit = jest.fn() as jest.MockedFunction<InventoryRepository['findManyByUnit']>;
    const repo: InventoryRepository = {
      findManyByUnit,
      applyMovement: jest.fn() as jest.MockedFunction<InventoryRepository['applyMovement']>,
      initialize: jest.fn() as jest.MockedFunction<InventoryRepository['initialize']>,
    };
    useCase = new GetInventoryUseCase(repo);
  });

  it('over-fetches by one, trims to the page and reports no next page when under the limit', async () => {
    findManyByUnit.mockResolvedValue([row('a'), row('b')]);

    const result = await useCase.execute({ businessUnitId: 'bu-1', limit: 20 });

    // take is limit + 1 so a full page can be detected.
    expect(findManyByUnit).toHaveBeenCalledWith({
      businessUnitId: 'bu-1',
      take: 21,
      keyset: undefined,
    });
    expect(result.data).toHaveLength(2);
    expect(result.meta).toEqual({ limit: 20, hasMore: false, nextCursor: null });
  });

  it('trims the over-fetched row and exposes the last kept id as the next cursor', async () => {
    findManyByUnit.mockResolvedValue([row('a'), row('b'), row('c')]);

    const result = await useCase.execute({
      businessUnitId: 'bu-1',
      cursor: encodeInventoryCursor(CREATED_AT, 'prev'),
      limit: 2,
    });

    expect(findManyByUnit).toHaveBeenCalledWith({
      businessUnitId: 'bu-1',
      take: 3,
      keyset: { timestamp: CREATED_AT, id: 'prev' },
    });
    expect(result.data.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.meta).toEqual({
      limit: 2,
      hasMore: true,
      nextCursor: encodeInventoryCursor(CREATED_AT, 'b'),
    });
  });

  it('wraps persistence failures in InventoryFetchError with the cause chained', async () => {
    const boom = new Error('db down');
    findManyByUnit.mockRejectedValue(boom);

    const err: unknown = await useCase
      .execute({ businessUnitId: 'bu-1', limit: 20 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InventoryFetchError);
    expect((err as Error).cause).toBe(boom);
  });
});
