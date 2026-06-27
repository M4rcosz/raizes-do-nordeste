import { ApiProperty } from '@nestjs/swagger';
import { MenuItemWithProduct } from '../../../domain/repositories/menu-item.repository';

/**
 * Public view of a menu item. Exposes the product's display fields and the
 * unit's effective price; omits internal flags and timestamps.
 */
export class PublicMenuItemResponseDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  public readonly menuItemId: string;

  @ApiProperty({
    example: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    format: 'uuid',
  })
  public readonly productId: string;

  @ApiProperty({ example: 'Moqueca de peixe' })
  public readonly name: string;

  @ApiProperty({
    example: 'Ensopado de peixe com leite de coco e dendê',
    type: String,
    nullable: true,
  })
  public readonly description: string | null;

  @ApiProperty({ example: 'https://example.com/images/moqueca.jpg' })
  public readonly imageUrl: string;

  @ApiProperty({
    example: '18.50',
    type: String,
    description: 'Effective price at this unit, decimal string with 2 places',
  })
  public readonly price: string;

  constructor(
    menuItemId: string,
    productId: string,
    name: string,
    description: string | null,
    imageUrl: string,
    price: string,
  ) {
    this.menuItemId = menuItemId;
    this.productId = productId;
    this.name = name;
    this.description = description;
    this.imageUrl = imageUrl;
    this.price = price;
  }

  static fromReadModel(readModel: MenuItemWithProduct): PublicMenuItemResponseDto {
    return new PublicMenuItemResponseDto(
      readModel.menuItem.id,
      readModel.product.id,
      readModel.product.name,
      readModel.product.description,
      readModel.product.imageUrl,
      readModel.menuItem.customPrice.toDecimalString(),
    );
  }
}
