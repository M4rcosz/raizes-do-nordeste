import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { ListOrdersUseCase } from './list-orders.use-case';
import { OrdersFetchError } from '../errors/orders-fetch.error';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import { Order } from '../../domain/entities/order.entity';
import { OrderChannel } from '../../domain/value-objects/order-channel';
import { OrderStatus } from '../../domain/value-objects/order-status';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import type { OrderActor } from '../order-actor';
import { OrderSortField, SortDirection } from '../../domain/value-objects/order-sort';
import { decodeOrderCursor, encodeOrderCursor } from '../list-orders-cursor';
import { InvalidOrderCursorError } from '../errors/invalid-order-cursor.error';

const DEFAULT_SORT = { field: OrderSortField.CREATED_AT, direction: SortDirection.DESC };
const NO_FILTERS = {
  orderChannel: undefined,
  orderStatus: undefined,
  attendantId: undefined,
  customerId: undefined,
  createdAtFrom: undefined,
  createdAtTo: undefined,
  minTotal: undefined,
  maxTotal: undefined,
};

const admin: OrderActor = { id: 'admin-1', role: UserRole.ADMIN, businessUnitIds: [] };
const manager = (units: string[]): OrderActor => ({
  id: 'mgr-1',
  role: UserRole.MANAGER,
  businessUnitIds: units,
});

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

  it('fetches limit+1 rows and forwards filters to the repository (ADMIN is unrestricted)', async () => {
    findMany.mockResolvedValue([makeOrder('o-1')]);

    await useCase.execute({
      limit: 10,
      cursor: encodeOrderCursor('o-0', DEFAULT_SORT),
      filters: { orderChannel: OrderChannel.APP },
      actor: admin,
    });

    // ADMIN with no explicit unit filter: businessUnitIds undefined = brand-wide.
    expect(findMany).toHaveBeenCalledWith({
      filters: {
        ...NO_FILTERS,
        businessUnitIds: undefined,
        orderChannel: OrderChannel.APP,
      },
      pagination: { cursor: 'o-0', take: 11 },
      sort: DEFAULT_SORT,
    });
  });

  it('clamps a staff listing to the claim units', async () => {
    findMany.mockResolvedValue([]);

    await useCase.execute({ limit: 10, actor: manager(['bu-1', 'bu-2']) });

    expect(findMany).toHaveBeenCalledWith({
      filters: {
        ...NO_FILTERS,
        businessUnitIds: ['bu-1', 'bu-2'],
      },
      pagination: { cursor: undefined, take: 11 },
      sort: DEFAULT_SORT,
    });
  });

  it('narrows a staff filter within the claim and blocks one outside it with an empty scope', async () => {
    findMany.mockResolvedValue([]);

    await useCase.execute({
      limit: 10,
      filters: { businessUnitId: 'bu-9' },
      actor: manager(['bu-1']),
    });

    // bu-9 is not in the claim: empty IN list matches nothing, never another unit.
    expect(findMany).toHaveBeenCalledWith({
      filters: { ...NO_FILTERS, businessUnitIds: [] },
      pagination: { cursor: undefined, take: 11 },
      sort: DEFAULT_SORT,
    });
  });

  it('forwards the date range, attendant, customer and total bounds untouched', async () => {
    findMany.mockResolvedValue([]);
    const createdAtFrom = new Date('2026-07-01T00:00:00.000Z');
    const createdAtTo = new Date('2026-07-31T23:59:59.999Z');

    await useCase.execute({
      limit: 10,
      filters: {
        attendantId: 'att-1',
        customerId: 'cus-1',
        createdAtFrom,
        createdAtTo,
        minTotal: '10.00',
        maxTotal: '250.00',
      },
      actor: admin,
    });

    expect(findMany).toHaveBeenCalledWith({
      filters: {
        businessUnitIds: undefined,
        orderChannel: undefined,
        orderStatus: undefined,
        attendantId: 'att-1',
        customerId: 'cus-1',
        createdAtFrom,
        createdAtTo,
        // Money stays a decimal string end to end, never a JS number.
        minTotal: '10.00',
        maxTotal: '250.00',
      },
      pagination: { cursor: undefined, take: 11 },
      sort: DEFAULT_SORT,
    });
  });

  it('defaults to createdAt desc when no sort is requested', async () => {
    findMany.mockResolvedValue([]);

    await useCase.execute({ limit: 10, actor: admin });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: { field: OrderSortField.CREATED_AT, direction: SortDirection.DESC },
      }),
    );
  });

  it('forwards an explicit sort to the repository', async () => {
    findMany.mockResolvedValue([]);
    const sort = { field: OrderSortField.TOTAL_AMOUNT, direction: SortDirection.ASC };

    await useCase.execute({ limit: 10, sort, actor: admin });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ sort }));
  });

  it('keeps the unit scope when a customerId filter is combined with a foreign businessUnitId', async () => {
    findMany.mockResolvedValue([]);

    await useCase.execute({
      limit: 10,
      filters: { customerId: 'cus-1', businessUnitId: 'bu-9' },
      actor: manager(['bu-1']),
    });

    // The extra customer filter must not widen or drop the clamp: bu-9 is outside
    // the claim, so the scope stays [] and the listing can match no rows.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ businessUnitIds: [], customerId: 'cus-1' }),
      }),
    );
  });

  describe('cursor', () => {
    it('decodes the token and passes the bare row id to the repository', async () => {
      findMany.mockResolvedValue([]);

      await useCase.execute({
        limit: 10,
        cursor: encodeOrderCursor('o-42', DEFAULT_SORT),
        actor: admin,
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ pagination: { cursor: 'o-42', take: 11 } }),
      );
    });

    it('rejects a cursor minted under a different sortBy', async () => {
      findMany.mockResolvedValue([]);
      const cursor = encodeOrderCursor('o-1', {
        field: OrderSortField.TOTAL_AMOUNT,
        direction: SortDirection.DESC,
      });

      await expect(
        useCase.execute({
          limit: 10,
          cursor,
          sort: { field: OrderSortField.CREATED_AT, direction: SortDirection.DESC },
          actor: admin,
        }),
      ).rejects.toBeInstanceOf(InvalidOrderCursorError);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('rejects a cursor minted under a different sortDir', async () => {
      findMany.mockResolvedValue([]);
      const cursor = encodeOrderCursor('o-1', {
        field: OrderSortField.CREATED_AT,
        direction: SortDirection.ASC,
      });

      await expect(
        useCase.execute({
          limit: 10,
          cursor,
          sort: { field: OrderSortField.CREATED_AT, direction: SortDirection.DESC },
          actor: admin,
        }),
      ).rejects.toBeInstanceOf(InvalidOrderCursorError);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('rejects a garbage token instead of silently restarting at page 1', async () => {
      findMany.mockResolvedValue([]);

      await expect(
        useCase.execute({ limit: 10, cursor: 'not-a-real-cursor', actor: admin }),
      ).rejects.toBeInstanceOf(InvalidOrderCursorError);
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  it('trims the extra row and reports hasMore + a nextCursor encoding the last kept row', async () => {
    const rows = [makeOrder('o-1'), makeOrder('o-2'), makeOrder('o-3')];
    findMany.mockResolvedValue(rows);

    const result = await useCase.execute({ limit: 2, actor: admin });

    expect(result.data).toHaveLength(2);
    expect(result.meta.hasMore).toBe(true);
    expect(result.meta.nextCursor).not.toBeNull();
    expect(decodeOrderCursor(result.meta.nextCursor!)).toEqual({
      sortBy: OrderSortField.CREATED_AT,
      sortDir: SortDirection.DESC,
      id: 'o-2',
    });
  });

  it('encodes the active sort into nextCursor so the next page cannot change it silently', async () => {
    findMany.mockResolvedValue([makeOrder('o-1'), makeOrder('o-2')]);

    const result = await useCase.execute({
      limit: 1,
      sort: { field: OrderSortField.TOTAL_AMOUNT, direction: SortDirection.ASC },
      actor: admin,
    });

    expect(decodeOrderCursor(result.meta.nextCursor!)).toEqual({
      sortBy: OrderSortField.TOTAL_AMOUNT,
      sortDir: SortDirection.ASC,
      id: 'o-1',
    });
  });

  it('feeds its own nextCursor back as a valid cursor for the next page', async () => {
    findMany.mockResolvedValue([makeOrder('o-1'), makeOrder('o-2')]);
    const sort = { field: OrderSortField.TOTAL_AMOUNT, direction: SortDirection.ASC };
    const first = await useCase.execute({ limit: 1, sort, actor: admin });

    await useCase.execute({ limit: 1, sort, cursor: first.meta.nextCursor!, actor: admin });

    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ pagination: { cursor: 'o-1', take: 2 } }),
    );
  });

  it('reports no more pages when fewer than limit+1 rows come back', async () => {
    findMany.mockResolvedValue([makeOrder('o-1')]);

    const result = await useCase.execute({ limit: 2, actor: admin });

    expect(result.data).toHaveLength(1);
    expect(result.meta.hasMore).toBe(false);
    expect(result.meta.nextCursor).toBeNull();
  });

  it('wraps repository failures in OrdersFetchError', async () => {
    findMany.mockRejectedValue(new Error('db down'));

    await expect(useCase.execute({ limit: 10, actor: admin })).rejects.toBeInstanceOf(
      OrdersFetchError,
    );
  });
});
