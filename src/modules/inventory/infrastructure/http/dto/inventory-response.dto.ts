import { ApiProperty } from '@nestjs/swagger';
import { Inventory } from '@modules/inventory/domain/entities/inventory.entity';

export class InventoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  readonly businessUnitId!: string;

  @ApiProperty({ format: 'uuid' })
  readonly productId!: string;

  @ApiProperty({ example: 42 })
  readonly quantity!: number;

  @ApiProperty({ example: 5, description: 'Replenishment threshold for STOCK_ALERT.' })
  readonly minQuantity!: number;

  @ApiProperty()
  readonly updatedAt!: Date;

  static fromEntity(inventory: Inventory): InventoryResponseDto {
    return Object.assign(new InventoryResponseDto(), {
      id: inventory.id,
      businessUnitId: inventory.businessUnitId,
      productId: inventory.productId,
      quantity: inventory.quantity,
      minQuantity: inventory.minQuantity,
      updatedAt: inventory.updatedAt,
    });
  }
}
