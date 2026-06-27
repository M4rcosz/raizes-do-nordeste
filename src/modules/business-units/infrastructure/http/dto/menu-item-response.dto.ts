import { ApiProperty } from '@nestjs/swagger';
import { MenuItem } from '../../../domain/entities/menu-item.entity';

/** Internal/management view of a menu item. Exposes the full row. */
export class MenuItemResponseDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  public readonly id: string;

  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    format: 'uuid',
  })
  public readonly businessUnitId: string;

  @ApiProperty({
    example: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    format: 'uuid',
  })
  public readonly productId: string;

  @ApiProperty({
    example: '18.50',
    type: String,
    description: 'Custom price in BRL, decimal string with 2 places',
  })
  public readonly customPrice: string;

  @ApiProperty({ example: true })
  public readonly isAvailable: boolean;

  @ApiProperty({ example: '2026-05-18T10:30:00.000Z' })
  public readonly createdAt: Date;

  @ApiProperty({ example: '2026-05-18T10:30:00.000Z' })
  public readonly updatedAt: Date;

  constructor(
    id: string,
    businessUnitId: string,
    productId: string,
    customPrice: string,
    isAvailable: boolean,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this.id = id;
    this.businessUnitId = businessUnitId;
    this.productId = productId;
    this.customPrice = customPrice;
    this.isAvailable = isAvailable;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static fromEntity(item: MenuItem): MenuItemResponseDto {
    return new MenuItemResponseDto(
      item.id,
      item.businessUnitId,
      item.productId,
      item.customPrice.toDecimalString(),
      item.isAvailable,
      item.createdAt,
      item.updatedAt,
    );
  }
}
