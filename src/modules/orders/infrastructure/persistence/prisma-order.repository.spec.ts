import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { Money } from '@shared/domain/value-objects/money';
import { PrismaOrderRepository } from './prisma-order.repository';
import type { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import type { CreateOrderInput } from '@modules/orders/domain/repositories/order.repository';
import { Order } from '@modules/orders/domain/entities/order.entity';
import { OrderChannel } from '@modules/orders/domain/value-objects/order-channel';
import { OrderReferenceNotFoundError } from '@modules/orders/domain/errors/order-reference-not-found.error';

type OrderCreateFn = (args: unknown) => Promise<PersistedOrderRow>;
type OrderFindUniqueFn = (args: unknown) => Promise<PersistedOrderRow | null>;
type OrderFindManyFn = (args: unknown) => Promise<PersistedOrderRow[]>;
type OrderUpdateManyFn = (args: unknown) => Promise<{ count: number }>;

interface PersistedOrderRow {
  id: string;
  businessUnitId: string;
  customerId: string | null;
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
  new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: '7.7.0',
    meta: fieldName ? { field_name: fieldName } : undefined,
  });

describe('PrismaOrderRepository', () => {
  let create: jest.MockedFunction<OrderCreateFn>;
  let findUnique: jest.MockedFunction<OrderFindUniqueFn>;
  let findMany: jest.MockedFunction<OrderFindManyFn>;
  let updateMany: jest.MockedFunction<OrderUpdateManyFn>;
  let repo: PrismaOrderRepository;

  const input: CreateOrderInput = {
    businessUnitId: 'bu-1',
    customerId: 'c-1',
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
        include: { orderItems: true },
      });

      expect(order).toBeInstanceOf(Order);
      expect(order.id).toBe('order-1');
      expect(order.totalAmount.equals(Money.fromDecimalString('25.00'))).toBe(true);
      expect(order.orderItems).toHaveLength(2);
      expect(order.orderItems[0].subtotal.equals(Money.fromDecimalString('20'))).toBe(true);
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
        include: { orderItems: true },
      });
      expect(order).toBeInstanceOf(Order);
      expect(order?.id).toBe('order-1');
    });

    it('returns null when no row is found', async () => {
      findUnique.mockResolvedValue(null);

      await expect(repo.findById('missing')).resolves.toBeNull();
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
        include: { orderItems: true },
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
        include: { orderItems: true },
      });
    });

    it('scopes by customerId for the customer self-listing path', async () => {
      findMany.mockResolvedValue([]);

      await repo.findMany({ filters: { customerId: 'c-1' }, pagination: { take: 20 } });

      expect(findMany).toHaveBeenCalledWith({
        where: { customerId: 'c-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        include: { orderItems: true },
      });
    });

    it('turns an empty unit scope into IN () so a clamped-out staff sees no rows', async () => {
      findMany.mockResolvedValue([]);

      await repo.findMany({ filters: { businessUnitIds: [] }, pagination: { take: 20 } });

      expect(findMany).toHaveBeenCalledWith({
        where: { businessUnitId: { in: [] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        include: { orderItems: true },
      });
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
        include: { orderItems: true },
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
