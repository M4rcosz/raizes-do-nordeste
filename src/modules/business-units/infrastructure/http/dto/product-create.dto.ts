import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, IsUUID, Matches, MaxLength } from 'class-validator';

export class ProductCreateDto {
  @ApiProperty({ example: 'Acarajé', maxLength: 100 })
  @MaxLength(100)
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    example: 'Bolinho de feijão-fradinho frito no azeite de dendê',
    maxLength: 255,
  })
  @IsOptional()
  @MaxLength(255)
  @IsString()
  description?: string;

  @ApiProperty({
    example: '12.50',
    description: 'Positive decimal string with up to 2 fractional digits (DB Decimal(10,2)).',
  })
  // Matches DB Decimal(10,2): positive amount, rejects zero, max 8 integer + 2 fractional digits.
  @Matches(/^(?!0+(?:\.0+)?$)\d{1,8}(?:\.\d{1,2})?$/, {
    message: 'price must be a positive decimal string with up to 2 decimal places',
  })
  price!: string;

  @ApiProperty({ example: '7c9e6679-7425-40de-944b-e07fc1f90ae7', format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({
    example: 'https://example.com/images/acaraje.jpg',
    maxLength: 2000,
    nullable: true,
    description:
      'Optional. Leave it out and use the image upload flow ' +
      '(POST /products/:productId/image/upload-url) instead.',
  })
  // Omitted and explicit null both mean "no image yet", which the column now
  // allows. No @ValidateIf guard here: unlike business-unit-update, where null
  // would blank a NOT NULL field, null is a legitimate value for this one.
  @IsOptional()
  @MaxLength(2000)
  @IsUrl()
  imageUrl?: string | null;
}
