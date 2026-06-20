import { ApiProperty } from '@nestjs/swagger';
import { Product } from '../../../domain/entities/product.entity';

export class ProductResponseDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  public readonly id: string;

  @ApiProperty({ example: 'Acarajé' })
  public readonly name: string;

  @ApiProperty({
    example: 'Black-eyed pea fritter fried in dendê palm oil',
    type: String,
    nullable: true,
  })
  public readonly description: string | null;

  @ApiProperty({
    example: '18.50',
    type: String,
    description: 'Price in BRL, decimal string with 2 places',
  })
  public readonly price: string;

  @ApiProperty({ example: true })
  public readonly isActive: boolean;

  @ApiProperty({
    example: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    format: 'uuid',
  })
  public readonly categoryId: string;

  @ApiProperty({ example: '2026-05-18T10:30:00.000Z' })
  public readonly createdAt: Date;

  @ApiProperty({ example: '2026-05-18T10:30:00.000Z' })
  public readonly updatedAt: Date;

  @ApiProperty({ example: 'https://example.com/images/acaraje.jpg' })
  public readonly imageUrl: string;

  constructor(
    id: string,
    name: string,
    description: string | null,
    price: string,
    isActive: boolean,
    categoryId: string,
    createdAt: Date,
    updatedAt: Date,
    imageUrl: string,
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.price = price;
    this.isActive = isActive;
    this.categoryId = categoryId;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.imageUrl = imageUrl;
  }

  static fromEntity(product: Product): ProductResponseDto {
    return new ProductResponseDto(
      product.id,
      product.name,
      product.description,
      product.price.toDecimalString(),
      product.isActive,
      product.categoryId,
      product.createdAt,
      product.updatedAt,
      product.imageUrl,
    );
  }
}
