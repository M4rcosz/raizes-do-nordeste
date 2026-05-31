import { OrderChannel } from '@modules/orders/domain/value-objects/order-channel';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
