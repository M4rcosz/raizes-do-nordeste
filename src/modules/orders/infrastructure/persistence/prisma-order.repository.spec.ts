import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { Money } from '@shared/domain/value-objects/money';
import { PrismaOrderRepository } from './prisma-order.repository';
import type { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import type { CreateOrderInput } from '@modules/orders/domain/repositories/order.repository';
import { Order } from '@modules/orders/domain/entities/order.entity';
import { OrderChannel } from '@modules/orders/domain/value-objects/order-channel';
import { OrderSortField, SortDirection } from '@modules/orders/domain/value-objects/order-sort';
import { OrderReferenceNotFoundError } from '@modules/orders/domain/errors/order-reference-not-found.error';
import { knownRequestError } from '@shared/infrastructure/prisma/testing/prisma-mock';

type OrderCreateFn = (args: unknown) => Promise<PersistedOrderRow>;
type OrderFindUniqueFn = (args: unknown) => Promise<PersistedOrderRow | null>;
type OrderFindManyFn = (args: unknown) => Promise<PersistedOrderRow[]>;
type OrderUpdateManyFn = (args: unknown) => Promise<{ count: number }>;

interface PersistedOrderRow {
  id: string;
  businessUnitId: string;
  customerId: string | null;
  customerName: string | null;
  /** Selected relation: present only when customerId is set. */
  customer: { name: string } | null;
  attendantId: string | null;
  pointsRedeemed: number;
  pointsEarned: number;
  totalAmount: Prisma.Decimal;
  notes: string | null;
  orderChannel: 'APP' | 'WEB' | 'TOTEM' | 'COUNTER' | 'PICKUP';
  orderStatus: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';
  createdAt: Date;
  updatedAt: Date;
  updatedById: string | null;
  orderItems: {
    id: string;
    orderId: string;
    productId: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    notes: string | null;
  }[];
}

const knownError = (code: string, fieldName?: string): Prisma.PrismaClientKnownRequestError =>
  knownRequestError(code, fieldName ? { field_name: fieldName } : undefined);

describe('PrismaOrderRepository', () => {
  let create: jest.MockedFunction<OrderCreateFn>;
  let findUnique: jest.MockedFunction<OrderFindUniqueFn>;
  let findMany: jest.MockedFunction<OrderFindManyFn>;
  let updateMany: jest.MockedFunction<OrderUpdateManyFn>;
  let repo: PrismaOrderRepository;

  const input: CreateOrderInput = {
    businessUnitId: 'bu-1',
    customerId: 'c-1',
    customerName: null,
    attendantId: null,
    totalAmount: '25.00',
    pointsRedeemed: 0,
    notes: null,
    orderChannel: OrderChannel.APP,
    orderItems: [
      { productId: 'p-1', quantity: 2, unitPrice: '10.00', subtotal: '20.00' },
      { productId: 'p-2', quantity: 1, unitPrice: '5.00', subtotal: '5.00' },
    ],
  };

  const persistedRow: PersistedOrderRow = {
    id: 'order-1',
    businessUnitId: 'bu-1',
    customerId: 'c-1',
    customerName: null,
    customer: { name: 'Ana Souza' },
    attendantId: null,
    pointsRedeemed: 0,
    pointsEarned: 0,
    totalAmount: new Prisma.Decimal('25.00'),
    notes: null,
    orderChannel: 'APP',
    orderStatus: 'PENDING',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    updatedById: null,
    orderItems: [
      {
        id: 'item-1',
        orderId: 'order-1',
        productId: 'p-1',
        quantity: 2,
        unitPrice: new Prisma.Decimal('10.00'),
        subtotal: new Prisma.Decimal('20.00'),
        notes: null,
      },
      {
        id: 'item-2',
        orderId: 'order-1',
        productId: 'p-2',
        quantity: 1,
        unitPrice: new Prisma.Decimal('5.00'),
        subtotal: new Prisma.Decimal('5.00'),
        notes: null,
      },
    ],
  };

  beforeEach(() => {
    create = jest.fn() as jest.MockedFunction<OrderCreateFn>;
    findUnique = jest.fn() as jest.MockedFunction<OrderFindUniqueFn>;
    findMany = jest.fn() as jest.MockedFunction<OrderFindManyFn>;
    updateMany = jest.fn() as jest.MockedFunction<OrderUpdateManyFn>;
    const prisma = {
      order: { create, findUnique, findMany, updateMany },
    } as unknown as PrismaService;
    repo = new PrismaOrderRepository(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('forwards the input to Prisma and maps the persisted row to a domain Order', async () => {
      create.mockResolvedValue(persistedRow);

      const order = await repo.create(input);

      expect(create).toHaveBeenCalledWith({
        data: {
          businessUnitId: 'bu-1',
          customerId: 'c-1',
          customerName: null,
          attendantId: null,
          totalAmount: '25.00',
          pointsRedeemed: 0,
          orderChannel: 'APP',
          notes: null,
          orderItems: {
            createMany: {
              data: input.orderItems,
            },
          },
        },
        include: { orderItems: true, customer: { select: { name: true } } },
      });

      expect(order).toBeInstanceOf(Order);
      expect(order.id).toBe('order-1');
      expect(order.totalAmount.equals(Money.fromDecimalString('25.00'))).toBe(true);
      expect(order.orderItems).toHaveLength(2);
      expect(order.orderItems[0].subtotal.equals(Money.fromDecimalString('20'))).toBe(true);
    });

    it('persists the guest name when the order carries no customer account', async () => {
      create.mockResolvedValue({
        ...persistedRow,
        customerId: null,
        customerName: 'Maria',
        customer: null,
      });

      await repo.create({ ...input, customerId: null, customerName: 'Maria' });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ customerId: null, customerName: 'Maria' }),
        }),
      );
    });

    it('translates a P2003 foreign-key violation into OrderReferenceNotFoundError, chaining the cause', async () => {
      const prismaError = knownError('P2003', 'orders_customer_id_fkey');
      create.mockRejectedValue(prismaError);

      await expect(repo.create(input)).rejects.toBeInstanceOf(OrderReferenceNotFoundError);
      await expect(repo.create(input)).rejects.toMatchObject({ cause: prismaError });
    });

    it.each<[string, string]>([
      ['orders_customer_id_fkey', 'customer'],
      ['orders_business_unit_id_fkey', 'business unit'],
      ['order_items_product_id_fkey', 'product'],
      ['orders_attendant_id_fkey', 'attendant'],
    ])('names %s as a %s reference in the error message', async (fieldName, expected) => {
      create.mockRejectedValue(knownError('P2003', fieldName));

      await expect(repo.create(input)).rejects.toMatchObject({
        message: `Order references a ${expected} that does not exist.`,
      });
    });

    it('falls back to a generic reference label when field_name is missing', async () => {
      create.mockRejectedValue(knownError('P2003'));

      await expect(repo.create(input)).rejects.toMatchObject({
        message: 'Order references a related entity that does not exist.',
      });
    });

    it('rethrows unmapped Prisma error codes unchanged', async () => {
      const prismaError = knownError('P2002', 'orders_cnpj_key');
      create.mockRejectedValue(prismaError);

      await expect(repo.create(input)).rejects.toBe(prismaError);
    });

    it('rethrows non-Prisma errors unchanged', async () => {
      const genericError = new Error('connection lost');
      create.mockRejectedValue(genericError);

      await expect(repo.create(input)).rejects.toBe(genericError);
    });
  });

  describe('findById', () => {
    it('maps the persisted row to a domain Order', async () => {
      findUnique.mockResolvedValue(persistedRow);

      const order = await repo.findById('order-1');

      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        include: { orderItems: true, customer: { select: { name: true } } },
      });
      expect(order).toBeInstanceOf(Order);
      expect(order?.id).toBe('order-1');
    });

    it('returns null when no row is found', async () => {
      findUnique.mockResolvedValue(null);

      await expect(repo.findById('missing')).resolves.toBeNull();
    });

    describe('display name resolution', () => {
      it("takes the account holder's current name from the relation when a customer is attached", async () => {
        findUnique.mockResolvedValue(persistedRow);

        const order = await repo.findById('order-1');

        expect(order?.customerId).toBe('c-1');
        expect(order?.customerName).toBe('Ana Souza');
      });

      it('takes the stored guest name when no customer is attached', async () => {
        findUnique.mockResolvedValue({
          ...persistedRow,
          customerId: null,
          customerName: 'Maria',
          customer: null,
        });

        const order = await repo.findById('order-1');

        expect(order?.customerId).toBeNull();
        expect(order?.customerName).toBe('Maria');
      });

      it('resolves to null when the order carries neither (legacy rows)', async () => {
        findUnique.mockResolvedValue({
          ...persistedRow,
          customerId: null,
          customerName: null,
          customer: null,
        });

        const order = await repo.findById('order-1');

        expect(order?.customerName).toBeNull();
      });
    });
  });

  describe('findMany', () => {
    it('applies filters, cursor pagination and ordering', async () => {
      findMany.mockResolvedValue([persistedRow]);

      const orders = await repo.findMany({
        filters: {
          businessUnitIds: ['bu-1'],
          orderChannel: OrderChannel.APP,
          orderStatus: 'PENDING',
        },
        pagination: { cursor: 'order-0', take: 11 },
      });

      expect(findMany).toHaveBeenCalledWith({
        where: { businessUnitId: { in: ['bu-1'] }, orderChannel: 'APP', orderStatus: 'PENDING' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 11,
        cursor: { id: 'order-0' },
        skip: 1,
        include: { orderItems: true, customer: { select: { name: true } } },
      });
      expect(orders).toHaveLength(1);
      expect(orders[0]).toBeInstanceOf(Order);
    });

    it('omits cursor/skip when no cursor is provided and sends an empty where for no filters', async () => {
      findMany.mockResolvedValue([]);

      await repo.findMany({ pagination: { take: 20 } });

      expect(findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        include: { orderItems: true, customer: { select: { name: true } } },
      });
    });

    it('scopes by customerId for the customer self-listing path', async () => {
      findMany.mockResolvedValue([]);

      await repo.findMany({ filters: { customerId: 'c-1' }, pagination: { take: 20 } });

      expect(findMany).toHaveBeenCalledWith({
        where: { customerId: 'c-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        include: { orderItems: true, customer: { select: { name: true } } },
      });
    });

    it('turns an empty unit scope into IN () so a clamped-out staff sees no rows', async () => {
      findMany.mockResolvedValue([]);

      await repo.findMany({ filters: { businessUnitIds: [] }, pagination: { take: 20 } });

      expect(findMany).toHaveBeenCalledWith({
        where: { businessUnitId: { in: [] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        include: { orderItems: true, customer: { select: { name: true } } },
      });
    });

    it('maps a sort to its column plus id as the unique final tie-break', async () => {
      findMany.mockResolvedValue([]);

      await repo.findMany({
        pagination: { take: 20 },
        sort: { field: OrderSortField.TOTAL_AMOUNT, direction: SortDirection.ASC },
      });

      // id must stay the last term: the row cursor is only stable while it is unique.
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ totalAmount: 'asc' }, { id: 'asc' }] }),
      );
    });

    it('sorts by createdAt ascending when asked', async () => {
      findMany.mockResolvedValue([]);

      await repo.findMany({
        pagination: { take: 20 },
        sort: { field: OrderSortField.CREATED_AT, direction: SortDirection.ASC },
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      );
    });

    it('filters by attendantId', async () => {
      findMany.mockResolvedValue([]);

      await repo.findMany({ filters: { attendantId: 'att-1' }, pagination: { take: 20 } });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { attendantId: 'att-1' } }),
      );
    });

    it('builds a closed createdAt range with an inclusive upper bound', async () => {
      findMany.mockResolvedValue([]);
      const from = new Date('2026-07-01T00:00:00.000Z');
      const to = new Date('2026-07-31T23:59:59.999Z');

      await repo.findMany({
        filters: { createdAtFrom: from, createdAtTo: to },
        pagination: { take: 20 },
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { createdAt: { gte: from, lte: to } } }),
      );
    });

    it('leaves the upper end open when only createdAtFrom is given', async () => {
      findMany.mockResolvedValue([]);
      const from = new Date('2026-07-01T00:00:00.000Z');

      await repo.findMany({ filters: { createdAtFrom: from }, pagination: { take: 20 } });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { createdAt: { gte: from } } }),
      );
    });

    it('leaves the lower end open when only createdAtTo is given', async () => {
      findMany.mockResolvedValue([]);
      const to = new Date('2026-07-31T23:59:59.999Z');

      await repo.findMany({ filters: { createdAtTo: to }, pagination: { take: 20 } });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { createdAt: { lte: to } } }),
      );
    });

    it('passes the total bounds through as decimal strings', async () => {
      findMany.mockResolvedValue([]);

      await repo.findMany({
        filters: { minTotal: '10.00', maxTotal: '250.00' },
        pagination: { take: 20 },
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { totalAmount: { gte: '10.00', lte: '250.00' } } }),
      );
    });

    it('leaves the upper end open when only minTotal is given', async () => {
      findMany.mockResolvedValue([]);

      await repo.findMany({ filters: { minTotal: '10.00' }, pagination: { take: 20 } });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { totalAmount: { gte: '10.00' } } }),
      );
    });
  });

  describe('updateStatus', () => {
    const updateInput = {
      id: 'order-1',
      expectedFrom: 'PENDING',
      orderStatus: 'CONFIRMED',
      updatedById: 'staff-1',
    } as const;

    it('applies the conditional update and returns the re-read Order when a row matched', async () => {
      updateMany.mockResolvedValue({ count: 1 });
      findUnique.mockResolvedValue({
        ...persistedRow,
        orderStatus: 'CONFIRMED',
        updatedById: 'staff-1',
      });

      const order = await repo.updateStatus(updateInput);

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', orderStatus: 'PENDING' },
        data: { orderStatus: 'CONFIRMED', updatedById: 'staff-1' },
      });
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        include: { orderItems: true, customer: { select: { name: true } } },
      });
      expect(order?.orderStatus).toBe('CONFIRMED');
      expect(order?.updatedById).toBe('staff-1');
    });

    it('returns null without re-reading when no row matched the expected status', async () => {
      updateMany.mockResolvedValue({ count: 0 });

      await expect(repo.updateStatus(updateInput)).resolves.toBeNull();
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('returns null when the row vanished between the update and the re-read', async () => {
      updateMany.mockResolvedValue({ count: 1 });
      findUnique.mockResolvedValue(null);

      await expect(repo.updateStatus(updateInput)).resolves.toBeNull();
    });

    it('translates a P2003 foreign-key violation into OrderReferenceNotFoundError, chaining the cause', async () => {
      const prismaError = knownError('P2003', 'orders_updated_by_fkey');
      updateMany.mockRejectedValue(prismaError);

      await expect(repo.updateStatus(updateInput)).rejects.toBeInstanceOf(
        OrderReferenceNotFoundError,
      );
      await expect(repo.updateStatus(updateInput)).rejects.toMatchObject({ cause: prismaError });
    });

    it('rethrows unmapped Prisma error codes unchanged', async () => {
      const prismaError = knownError('P2002');
      updateMany.mockRejectedValue(prismaError);

      await expect(repo.updateStatus(updateInput)).rejects.toBe(prismaError);
    });
  });
});
