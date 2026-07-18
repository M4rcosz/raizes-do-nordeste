import { OrderChannel } from '@modules/orders/domain/value-objects/order-channel';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsDecimal,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderItemCreateDto {
  @ApiProperty({ format: 'uuid', description: 'Product being ordered.' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 2, minimum: 1, description: 'Units ordered.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({
    example: '12.50',
    description: 'Unit price as a decimal string (money is never a JS number).',
  })
  @IsDecimal(
    { decimal_digits: '0,2' },
    { message: 'unitPrice must be a decimal string with up to 2 decimal places' },
  )
  unitPrice!: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  notes?: string;
}

export class OrderCreateDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  businessUnitId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Used only on attendant channels (COUNTER/PICKUP); ignored otherwise.',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    maxLength: 60,
    example: 'Maria',
    description:
      'Name to call the order by, for orders with no customer account. Whether it is ' +
      'required, optional or rejected depends on the channel: TOTEM always requires it, ' +
      'COUNTER/PICKUP require it only when no customerId is sent, APP/WEB reject it. ' +
      'Never sent together with customerId.',
  })
  @IsOptional()
  // Strip Unicode format characters (zero-width space, BOM, etc - category Cf) before
  // trimming: they survive JS trim() and would otherwise sneak an unreadable "name"
  // past @IsString/@MaxLength. Border convenience only - resolveCustomerName in the
  // use case is still the authoritative check.
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.replace(/\p{Cf}/gu, '').trim() : value,
  )
  @IsString()
  @MaxLength(60)
  customerName?: string;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  pointsRedeemed?: number;

  @ApiPropertyOptional({ maxLength: 150 })
  @MaxLength(150)
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ enum: OrderChannel })
  @IsEnum(OrderChannel)
  orderChannel!: OrderChannel;

  @ApiProperty({ type: [OrderItemCreateDto] })
  @Type(() => OrderItemCreateDto)
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  orderItems!: OrderItemCreateDto[];
}
