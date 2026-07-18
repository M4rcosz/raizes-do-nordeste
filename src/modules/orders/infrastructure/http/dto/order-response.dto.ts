import { Order } from '@modules/orders/domain/entities/order.entity';
import { OrderChannel } from '@modules/orders/domain/value-objects/order-channel';
import { OrderStatus } from '@modules/orders/domain/value-objects/order-status';
import { ApiProperty } from '@nestjs/swagger';

class OrderItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  readonly productId!: string;

  @ApiProperty({ example: 2 })
  readonly quantity!: number;

  @ApiProperty({ example: '12.50', description: 'Money serialized as a decimal string.' })
  readonly unitPrice!: string;

  @ApiProperty({ example: '25.00', description: 'Money serialized as a decimal string.' })
  readonly subtotal!: string;

  @ApiProperty({ nullable: true })
  readonly notes!: string | null;
}

export class OrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  readonly businessUnitId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  readonly customerId!: string | null;

  @ApiProperty({
    nullable: true,
    example: 'Maria',
    description:
      "Name the order is called by: the guest name when there is no account, otherwise the customer's.",
  })
  readonly customerName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  readonly attendantId!: string | null;

  @ApiProperty({ example: 0 })
  readonly pointsRedeemed!: number;

  @ApiProperty({ example: 0 })
  readonly pointsEarned!: number;

  @ApiProperty({ example: '25.00', description: 'Money serialized as a decimal string.' })
  readonly totalAmount!: string;

  @ApiProperty({ nullable: true })
  readonly notes!: string | null;

  @ApiProperty({ enum: OrderChannel })
  readonly orderChannel!: OrderChannel;

  @ApiProperty({ enum: OrderStatus })
  readonly orderStatus!: OrderStatus;

  @ApiProperty()
  readonly createdAt!: Date;

  @ApiProperty()
  readonly updatedAt!: Date;

  @ApiProperty({ format: 'uuid', nullable: true })
  readonly updatedById!: string | null;

  @ApiProperty({ type: [OrderItemResponseDto] })
  readonly orderItems!: OrderItemResponseDto[];

  static fromEntity(order: Order): OrderResponseDto {
    return Object.assign(new OrderResponseDto(), {
      id: order.id,
      businessUnitId: order.businessUnitId,
      customerId: order.customerId,
      customerName: order.customerName,
      attendantId: order.attendantId,
      pointsRedeemed: order.pointsRedeemed,
      pointsEarned: order.pointsEarned,
      totalAmount: order.totalAmount.toDecimalString(),
      notes: order.notes,
      orderChannel: order.orderChannel,
      orderStatus: order.orderStatus,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      updatedById: order.updatedById,
      orderItems: order.orderItems.map((item) =>
        Object.assign(new OrderItemResponseDto(), {
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toDecimalString(),
          subtotal: item.subtotal.toDecimalString(),
          notes: item.notes,
        }),
      ),
    });
  }
}
