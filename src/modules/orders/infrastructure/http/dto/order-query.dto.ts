import { OrderChannel } from '@modules/orders/domain/value-objects/order-channel';
import { OrderStatus } from '@modules/orders/domain/value-objects/order-status';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

export class OrdersQueryDto {
  @ApiPropertyOptional({
    example: 20,
    minimum: 1,
    maximum: 100,
    description: 'Items per page (default 20, max 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'ID of the last item from the previous page (cursor)',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by business unit' })
  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  @ApiPropertyOptional({ enum: OrderChannel, description: 'Filter by channel' })
  @IsOptional()
  @IsEnum(OrderChannel)
  orderChannel?: OrderChannel;

  @ApiPropertyOptional({ enum: OrderStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(OrderStatus)
  orderStatus?: OrderStatus;
}

export class OrderIdParamDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', format: 'uuid' })
  @IsUUID()
  id!: string;
}
