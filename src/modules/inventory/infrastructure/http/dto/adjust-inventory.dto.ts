import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import {
  MANUAL_MOVEMENT_TYPES,
  type ManualMovementType,
} from '@modules/inventory/domain/value-objects/inventory-transaction-type';

export class AdjustInventoryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ enum: MANUAL_MOVEMENT_TYPES, description: 'IN restocks, OUT removes.' })
  @IsIn(MANUAL_MOVEMENT_TYPES)
  type!: ManualMovementType;

  @ApiProperty({ example: 10, minimum: 1, description: 'Units moved; type carries direction.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ maxLength: 150, example: 'Weekly restock delivery.' })
  @IsString()
  @MaxLength(150)
  reason!: string;
}
