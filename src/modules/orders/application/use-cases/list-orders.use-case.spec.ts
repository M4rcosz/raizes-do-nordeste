import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { ListOrdersUseCase } from './list-orders.use-case';
import { OrdersFetchError } from '../errors/orders-fetch.error';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import { Order } from '../../domain/entities/order.entity';
import { OrderChannel } from '../../domain/value-objects/order-channel';
import { OrderStatus } from '../../domain/value-objects/order-status';

const makeOrder = (id: string): Order =>
  new Order(
    id,
    'bu-1',
    'c-1',
    null,
    0,
    0,
    Money.zero(),
    null,
    OrderChannel.APP,
    OrderStatus.PENDING,
    new Date(),
    new Date(),
    null,
    [],
  );

describe('ListOrdersUseCase', () => {
  let findMany: jest.MockedFunction<OrderRepository['findMany']>;
  let useCase: ListOrdersUseCase;

  beforeEach(() => {
    findMany = jest.fn() as jest.MockedFunction<OrderRepository['findMany']>;
    const repo = {
      create: jest.fn(),
      findById: jest.fn(),
      findMany,
      updateStatus: jest.fn(),
    } as unknown as OrderRepository;
    useCase = new ListOrdersUseCase(repo);
  });

  it('fetches limit+1 rows and forwards filters to the repository', async () => {
    findMany.mockResolvedValue([makeOrder('o-1')]);

    await useCase.execute({
      limit: 10,
      cursor: 'cursor-1',
      filters: { orderChannel: OrderChannel.APP },
    });

    expect(findMany).toHaveBeenCalledWith({
      filters: { orderChannel: OrderChannel.APP },
      pagination: { cursor: 'cursor-1', take: 11 },
    });
  });

  it('trims the extra row and reports hasMore + nextCursor when a full page is returned', async () => {
    const rows = [makeOrder('o-1'), makeOrder('o-2'), makeOrder('o-3')];
    findMany.mockResolvedValue(rows);

    const result = await useCase.execute({ limit: 2 });

    expect(result.data).toHaveLength(2);
    expect(result.meta.hasMore).toBe(true);
    expect(result.meta.nextCursor).toBe('o-2');
  });

  it('reports no more pages when fewer than limit+1 rows come back', async () => {
    findMany.mockResolvedValue([makeOrder('o-1')]);

    const result = await useCase.execute({ limit: 2 });

    expect(result.data).toHaveLength(1);
    expect(result.meta.hasMore).toBe(false);
    expect(result.meta.nextCursor).toBeNull();
  });

  it('wraps repository failures in OrdersFetchError', async () => {
    findMany.mockRejectedValue(new Error('db down'));

    await expect(useCase.execute({ limit: 10 })).rejects.toBeInstanceOf(OrdersFetchError);
  });
});
