import { Order } from '@modules/orders/domain/entities/order.entity';
import {
  CreateOrderInput,
  OrderRepository,
} from '@modules/orders/domain/repositories/order.repository';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import Big from 'big.js';
import { Prisma } from '@prisma/client';
import { OrderItem } from '@modules/orders/domain/entities/order-item.entity';
import { OrderReferenceNotFoundError } from '@modules/orders/domain/errors/order-reference-not-found.error';

@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateOrderInput): Promise<Order> {
    try {
      const fullOrder = await this.prisma.order.create({
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
      // P2003: a foreign key (businessUnit, customer or one of the products) points to a missing row.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new OrderReferenceNotFoundError(
          'Order references a business unit, customer or product that does not exist.',
          { cause: err },
        );
      }

      throw err;
    }
  }

  private toEntity(raw: Prisma.OrderGetPayload<{ include: { orderItems: true } }>): Order {
    return new Order(
      raw.id,
      raw.businessUnitId,
      raw.customerId,
      raw.attendantId,
      raw.pointsRedeemed,
      raw.pointsEarned,
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
