import { OrderChannel } from '@modules/orders/domain/value-objects/order-channel';
import { OrderStatus } from '@modules/orders/domain/value-objects/order-status';
import { OrderSortField, SortDirection } from '@modules/orders/domain/value-objects/order-sort';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { MAX_CURSOR_LENGTH } from '@shared/pagination/pagination';

/** Money on the wire. Decimal(10,2) is 10 digits total, so 8 of them may precede the point. */
const DECIMAL_AMOUNT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

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
    description:
      'Opaque token from the previous page (meta.nextCursor). Bound to the sort it was ' +
      'issued under: reusing it with a different sortBy/sortDir is rejected.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CURSOR_LENGTH)
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

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by the attendant who served' })
  @IsOptional()
  @IsUUID()
  attendantId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by customer' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    example: '2026-07-01T00:00:00.000Z',
    description: 'Only orders created at or after this instant (inclusive)',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdAtFrom?: Date;

  @ApiPropertyOptional({
    example: '2026-07-31T23:59:59.999Z',
    description: 'Only orders created at or before this instant (inclusive)',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdAtTo?: Date;

  @ApiPropertyOptional({
    example: '10.00',
    description: 'Minimum order total, inclusive (decimal string, up to 2 decimals)',
  })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_AMOUNT_PATTERN, { message: 'minTotal must be a decimal amount, e.g. 10.00' })
  minTotal?: string;

  @ApiPropertyOptional({
    example: '250.00',
    description: 'Maximum order total, inclusive (decimal string, up to 2 decimals)',
  })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_AMOUNT_PATTERN, { message: 'maxTotal must be a decimal amount, e.g. 250.00' })
  maxTotal?: string;

  @ApiPropertyOptional({
    enum: OrderSortField,
    description: 'Column to sort by (default createdAt)',
  })
  @IsOptional()
  @IsEnum(OrderSortField)
  sortBy?: OrderSortField;

  @ApiPropertyOptional({ enum: SortDirection, description: 'Sort direction (default desc)' })
  @IsOptional()
  @IsEnum(SortDirection)
  sortDir?: SortDirection;
}

export class OrderIdParamDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', format: 'uuid' })
  @IsUUID()
  id!: string;
}
