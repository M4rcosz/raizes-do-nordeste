import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { MAX_INVENTORY_QUANTITY } from '@modules/inventory/domain/value-objects/inventory-quantity';

export class InitializeInventoryItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({
    example: 10,
    minimum: 0,
    maximum: MAX_INVENTORY_QUANTITY,
    description: 'Opening balance; may be zero.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_INVENTORY_QUANTITY)
  quantity!: number;

  @ApiProperty({
    example: 5,
    minimum: 0,
    maximum: MAX_INVENTORY_QUANTITY,
    description: 'Replenishment threshold for STOCK_ALERT.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_INVENTORY_QUANTITY)
  minQuantity!: number;

  @ApiProperty({ maxLength: 150, example: 'Opening stock count.' })
  @IsString()
  @MaxLength(150)
  reason!: string;
}
