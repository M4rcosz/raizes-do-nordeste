import { OrderStatus } from '@modules/orders/domain/value-objects/order-status';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class OrderUpdateStatusDto {
  @ApiProperty({
    enum: OrderStatus,
    description: 'Target status. Must be a valid transition from the current status.',
  })
  @IsEnum(OrderStatus)
  orderStatus!: OrderStatus;
}
