import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import Big from 'big.js';
import { PrismaOrderRepository } from './prisma-order.repository';
import type { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import type { CreateOrderInput } from '@modules/orders/domain/repositories/order.repository';
import { Order } from '@modules/orders/domain/entities/order.entity';
import { OrderChannel } from '@modules/orders/domain/value-objects/order-channel';
import { OrderReferenceNotFoundError } from '@modules/orders/domain/errors/order-reference-not-found.error';

type OrderCreateFn = (args: unknown) => Promise<PersistedOrderRow>;

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

const knownError = (code: string): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: '7.7.0',
    meta: { field_name: 'orders_customer_id_fkey' },
  });

describe('PrismaOrderRepository', () => {
  let create: jest.MockedFunction<OrderCreateFn>;
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
    const prisma = { order: { create } } as unknown as PrismaService;
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
      expect(order.totalAmount.eq(new Big('25.00'))).toBe(true);
      expect(order.orderItems).toHaveLength(2);
      expect(order.orderItems[0].subtotal.eq(new Big('20'))).toBe(true);
    });

    it('translates a P2003 foreign-key violation into OrderReferenceNotFoundError, chaining the cause', async () => {
      const prismaError = knownError('P2003');
      create.mockRejectedValue(prismaError);

      await expect(repo.create(input)).rejects.toBeInstanceOf(OrderReferenceNotFoundError);
      await expect(repo.create(input)).rejects.toMatchObject({ cause: prismaError });
    });

    it('rethrows unmapped Prisma error codes unchanged', async () => {
      const prismaError = knownError('P2002');
      create.mockRejectedValue(prismaError);

      await expect(repo.create(input)).rejects.toBe(prismaError);
    });

    it('rethrows non-Prisma errors unchanged', async () => {
      const genericError = new Error('connection lost');
      create.mockRejectedValue(genericError);

      await expect(repo.create(input)).rejects.toBe(genericError);
    });
  });
});
