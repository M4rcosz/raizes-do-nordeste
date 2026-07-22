import { Order } from '@modules/orders/domain/entities/order.entity';
import {
  CreateOrderInput,
  FindOrdersInput,
  OrderFilters,
  OrderKeyset,
  OrderRepository,
  UpdateOrderStatusInput,
} from '@modules/orders/domain/repositories/order.repository';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { Money } from '@shared/domain/value-objects/money';
import { InvalidMoneyError } from '@shared/errors/domain/invalid-money.error';
import { CorruptPersistedMoneyError } from '@shared/errors/infrastructure/corrupt-persisted-money.error';
import { Prisma } from '@prisma/client';
import { OrderItem } from '@modules/orders/domain/entities/order-item.entity';
import { OrderReferenceNotFoundError } from '@modules/orders/domain/errors/order-reference-not-found.error';
import { TransactionContext } from '@shared/transaction/transaction-runner.port';
import {
  DEFAULT_ORDER_SORT,
  OrderSortField,
  SortDirection,
  type OrderSort,
} from '@modules/orders/domain/value-objects/order-sort';

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
          customerName: input.customerName,
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
          customer: { select: { name: true } },
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
      include: { orderItems: true, customer: { select: { name: true } } },
    });
    return raw ? this.toEntity(raw) : null;
  }

  async findMany(input: FindOrdersInput): Promise<Order[]> {
    const { filters, take, keyset, sort } = input;
    const effectiveSort = sort ?? DEFAULT_ORDER_SORT;

    const where = this.buildWhere(filters);
    if (keyset) {
      // AND-wrapped, not merged into `where` directly: the range filters above may
      // already constrain createdAt/totalAmount, and a bare OR key would also be
      // clobbered by any future OR-based filter.
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        this.buildKeysetPredicate(keyset, effectiveSort),
      ];
    }

    const raws = await this.prisma.order.findMany({
      where,
      orderBy: this.buildOrderBy(effectiveSort),
      take,
      include: { orderItems: true, customer: { select: { name: true } } },
    });

    return raws.map((raw) => this.toEntity(raw));
  }

  /**
   * "Strictly after the previous page's last row", expressed as a value comparison so
   * the row it names need not still exist or still match the filters. Mirrors
   * buildOrderBy exactly: the sorted column, then id as the tie-break, both in the
   * sort direction. Descending seeks smaller values, ascending larger ones.
   *
   * Prisma's positional `cursor` + `skip: 1` cannot be used here: an order that
   * transitions out of an orderStatus filter between two requests shifts the cursor's
   * position, and `skip: 1` then swallows the following row instead.
   */
  private buildKeysetPredicate(keyset: OrderKeyset, sort: OrderSort): Prisma.OrderWhereInput {
    // The wire value is typed per column: an ISO instant for createdAt, a decimal
    // string for totalAmount (handed to Prisma untouched so money never becomes a
    // JS number).
    const value: Date | string =
      sort.field === OrderSortField.CREATED_AT ? new Date(keyset.sortValue) : keyset.sortValue;

    const beyond = sort.direction === SortDirection.DESC ? 'lt' : 'gt';

    return {
      OR: [
        { [sort.field]: { [beyond]: value } },
        { [sort.field]: value, id: { [beyond]: keyset.id } },
      ],
    };
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
        include: { orderItems: true, customer: { select: { name: true } } },
      });
      // Vanished between the update and the re-read (delete race): treat as a conflict.
      return updated ? this.toEntity(updated) : null;
    } catch (err) {
      this.mapForeignKeyError(err);
    }
  }

  /**
   * Row-cursor pagination stays correct under any sort only while the last term is
   * unique, so id is always appended. It also tie-breaks rows sharing a sort value
   * (two orders with the same totalAmount) into a stable, repeatable order.
   */
  private buildOrderBy(sort: OrderSort): Prisma.OrderOrderByWithRelationInput[] {
    const { field, direction } = sort;
    const term: Record<OrderSortField, Prisma.OrderOrderByWithRelationInput> = {
      createdAt: { createdAt: direction },
      totalAmount: { totalAmount: direction },
    };
    return [term[field], { id: direction }];
  }

  private buildWhere(filters?: OrderFilters): Prisma.OrderWhereInput {
    if (!filters) {
      return {};
    }
    const where: Prisma.OrderWhereInput = {};
    // Unit authorization scope. undefined = brand-wide (ADMIN). An empty array
    // intentionally becomes `IN ()`, which matches no rows: a scoped actor asking
    // for a unit outside their claim gets nothing, never another unit's orders.
    if (filters.businessUnitIds !== undefined) {
      where.businessUnitId = { in: filters.businessUnitIds };
    }
    // Compare against undefined (not truthiness) so an empty customerId narrows
    // to no rows instead of silently dropping the scope and matching every order.
    if (filters.customerId !== undefined) {
      where.customerId = filters.customerId;
    }
    if (filters.orderChannel) {
      where.orderChannel = filters.orderChannel;
    }
    if (filters.orderStatus) {
      where.orderStatus = filters.orderStatus;
    }
    if (filters.attendantId !== undefined) {
      where.attendantId = filters.attendantId;
    }
    // Each bound is set on its own so a one-sided range stays open at the other end.
    if (filters.createdAtFrom !== undefined || filters.createdAtTo !== undefined) {
      where.createdAt = {
        ...(filters.createdAtFrom !== undefined && { gte: filters.createdAtFrom }),
        ...(filters.createdAtTo !== undefined && { lte: filters.createdAtTo }),
      };
    }
    // Decimal strings handed to Prisma untouched: parsing them here would round-trip
    // money through a JS number.
    if (filters.minTotal !== undefined || filters.maxTotal !== undefined) {
      where.totalAmount = {
        ...(filters.minTotal !== undefined && { gte: filters.minTotal }),
        ...(filters.maxTotal !== undefined && { lte: filters.maxTotal }),
      };
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

  private toEntity(
    raw: Prisma.OrderGetPayload<{
      include: { orderItems: true; customer: { select: { name: true } } };
    }>,
  ): Order {
    return new Order(
      raw.id,
      raw.businessUnitId,
      raw.customerId,
      // Exactly one side is ever populated, so the collapse is unambiguous: the stored
      // guest name for account-less orders, otherwise the account holder's current name
      // (read live, never denormalized).
      raw.customerName ?? raw.customer?.name ?? null,
      raw.attendantId,
      raw.pointsRedeemed,
      raw.pointsEarned,
      this.toMoney(raw.totalAmount),
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
            this.toMoney(item.unitPrice),
            item.notes,
          ),
      ),
    );
  }

  // Read-path Money parse. A persisted value big.js rejects means corrupt DB data
  // (server fault), so we rethrow as infra error -> HTTP 500 generic, raw value
  // stays in the cause for logs only, never echoed to the client.
  private toMoney(raw: { toString(): string }): Money {
    try {
      return Money.fromDecimalString(raw.toString());
    } catch (err) {
      if (err instanceof InvalidMoneyError) {
        throw new CorruptPersistedMoneyError({ cause: err });
      }
      throw err;
    }
  }
}
