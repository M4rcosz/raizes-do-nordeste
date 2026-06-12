import { Order } from '@modules/orders/domain/entities/order.entity';
import {
  CreateOrderInput,
  FindOrdersInput,
  OrderFilters,
  OrderRepository,
  UpdateOrderStatusInput,
} from '@modules/orders/domain/repositories/order.repository';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import Big from 'big.js';
import { Prisma } from '@prisma/client';
import { OrderItem } from '@modules/orders/domain/entities/order-item.entity';
import { OrderReferenceNotFoundError } from '@modules/orders/domain/errors/order-reference-not-found.error';
import { TransactionContext } from '@shared/transaction/transaction-runner.port';

@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateOrderInput, tx?: TransactionContext): Promise<Order> {
    const db = (tx as Prisma.TransactionClient) ?? this.prisma;

    try {
      const fullOrder = await db.order.create({
        data: {
          businessUnitId: input.businessUnitId,
          customerId: input.customerId,
          attendantId: input.attendantId,
          totalAmount: input.totalAmount,
          pointsRedeemed: input.pointsRedeemed,
          orderChannel: input.orderChannel,
          notes: input.notes,

          orderItems: {
            createMany: {
              data: input.orderItems,
            },
          },
        },
        include: {
          orderItems: true,
        },
      });

      return this.toEntity(fullOrder);
    } catch (err) {
      this.mapForeignKeyError(err);
    }
  }

  async findById(id: string, tx?: TransactionContext): Promise<Order | null> {
    const db = (tx as Prisma.TransactionClient) ?? this.prisma;

    const raw = await db.order.findUnique({
      where: { id },
      include: { orderItems: true },
    });
    return raw ? this.toEntity(raw) : null;
  }

  async findMany(input: FindOrdersInput): Promise<Order[]> {
    const { filters, pagination } = input;

    const raws = await this.prisma.order.findMany({
      where: this.buildWhere(filters),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.take,
      ...(pagination.cursor && {
        cursor: { id: pagination.cursor },
        skip: 1,
      }),
      include: { orderItems: true },
    });

    return raws.map((raw) => this.toEntity(raw));
  }

  async updateStatus(
    input: UpdateOrderStatusInput,
    tx?: TransactionContext,
  ): Promise<Order | null> {
    const db = (tx as Prisma.TransactionClient) ?? this.prisma;

    // Optimistic lock: the write only lands if the row still holds the status the caller
    // read. updateMany filters on a non-unique column and returns the match count; 0
    // means someone transitioned the order concurrently.
    try {
      const { count } = await db.order.updateMany({
        where: { id: input.id, orderStatus: input.expectedFrom },
        data: { orderStatus: input.orderStatus, updatedById: input.updatedById },
      });

      if (count === 0) {
        return null;
      }

      const updated = await db.order.findUnique({
        where: { id: input.id },
        include: { orderItems: true },
      });
      // Vanished between the update and the re-read (delete race): treat as a conflict.
      return updated ? this.toEntity(updated) : null;
    } catch (err) {
      this.mapForeignKeyError(err);
    }
  }

  private buildWhere(filters?: OrderFilters): Prisma.OrderWhereInput {
    // TODO(multi-unit): businessUnitId is only an optional caller-supplied filter today.
    // Once the JWT carries the staff member's unit, scope listings to it by default.
    if (!filters) {
      return {};
    }
    const where: Prisma.OrderWhereInput = {};
    if (filters.businessUnitId) {
      where.businessUnitId = filters.businessUnitId;
    }
    if (filters.orderChannel) {
      where.orderChannel = filters.orderChannel;
    }
    if (filters.orderStatus) {
      where.orderStatus = filters.orderStatus;
    }
    return where;
  }

  /** Maps a Prisma FK violation (P2003) to a domain error; rethrows anything else. */
  private mapForeignKeyError(err: unknown): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new OrderReferenceNotFoundError(
        `Order references a ${this.classifyForeignKey(err.meta)} that does not exist.`,
        { cause: err },
      );
    }

    throw err;
  }

  private classifyForeignKey(meta: unknown): string {
    const fieldName =
      typeof meta === 'object' && meta !== null && 'field_name' in meta
        ? String((meta as { field_name: unknown }).field_name).toLowerCase()
        : '';

    if (fieldName.includes('customer')) {
      return 'customer';
    }
    if (fieldName.includes('business_unit')) {
      return 'business unit';
    }
    if (fieldName.includes('product')) {
      return 'product';
    }
    if (fieldName.includes('attendant')) {
      return 'attendant';
    }
    return 'related entity';
  }

  private toEntity(raw: Prisma.OrderGetPayload<{ include: { orderItems: true } }>): Order {
    return new Order(
      raw.id,
      raw.businessUnitId,
      raw.customerId,
      raw.attendantId,
      raw.pointsRedeemed,
      raw.pointsEarned,
      new Big(raw.totalAmount.toString()),
      raw.notes,
      raw.orderChannel,
      raw.orderStatus,
      raw.createdAt,
      raw.updatedAt,
      raw.updatedById,
      raw.orderItems.map(
        (item) =>
          new OrderItem(
            item.id,
            item.orderId,
            item.productId,
            item.quantity,
            new Big(item.unitPrice.toString()),
            item.notes,
          ),
      ),
    );
  }
}
