import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { ListMyOrdersUseCase } from './list-my-orders.use-case';
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

describe('ListMyOrdersUseCase', () => {
  let findMany: jest.MockedFunction<OrderRepository['findMany']>;
  let useCase: ListMyOrdersUseCase;

  beforeEach(() => {
    findMany = jest.fn() as jest.MockedFunction<OrderRepository['findMany']>;
    const repo = {
      create: jest.fn(),
      findById: jest.fn(),
      findMany,
      updateStatus: jest.fn(),
    } as unknown as OrderRepository;
    useCase = new ListMyOrdersUseCase(repo);
  });

  it('scopes the listing to the caller customerId and forwards optional filters', async () => {
    findMany.mockResolvedValue([makeOrder('o-1')]);

    await useCase.execute({
      customerId: 'c-1',
      limit: 10,
      cursor: 'cursor-1',
      filters: { orderStatus: OrderStatus.PENDING },
    });

    expect(findMany).toHaveBeenCalledWith({
      filters: {
        customerId: 'c-1',
        orderChannel: undefined,
        orderStatus: OrderStatus.PENDING,
      },
      pagination: { cursor: 'cursor-1', take: 11 },
    });
  });

  it('trims the extra row and reports hasMore + nextCursor when a full page is returned', async () => {
    findMany.mockResolvedValue([makeOrder('o-1'), makeOrder('o-2'), makeOrder('o-3')]);

    const result = await useCase.execute({ customerId: 'c-1', limit: 2 });

    expect(result.data).toHaveLength(2);
    expect(result.meta.hasMore).toBe(true);
    expect(result.meta.nextCursor).toBe('o-2');
  });

  it('reports no more pages when fewer than limit+1 rows come back', async () => {
    findMany.mockResolvedValue([makeOrder('o-1')]);

    const result = await useCase.execute({ customerId: 'c-1', limit: 2 });

    expect(result.data).toHaveLength(1);
    expect(result.meta.hasMore).toBe(false);
    expect(result.meta.nextCursor).toBeNull();
  });

  it('wraps repository failures in OrdersFetchError', async () => {
    findMany.mockRejectedValue(new Error('db down'));

    await expect(useCase.execute({ customerId: 'c-1', limit: 10 })).rejects.toBeInstanceOf(
      OrdersFetchError,
    );
  });
});
