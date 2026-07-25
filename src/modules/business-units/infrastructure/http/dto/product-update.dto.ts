import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, IsUUID, Matches, MaxLength } from 'class-validator';
import { AtLeastOneOf } from '@shared/validation/at-least-one-of';

// Partial update of a product's catalog attributes. Every field is optional but
// at least one must be present. isActive is not editable here (it has its own
// activate/deactivate routes) and timestamps are owned by persistence.
export class ProductUpdateDto {
  @ApiPropertyOptional({ example: 'Acarajé', maxLength: 100 })
  @IsOptional()
  @MaxLength(100)
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: 'Bolinho de feijão-fradinho frito no azeite de dendê',
    maxLength: 255,
  })
  @IsOptional()
  @MaxLength(255)
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: '12.50',
    description: 'Positive decimal string with up to 2 fractional digits (DB Decimal(10,2)).',
  })
  @IsOptional()
  // Matches DB Decimal(10,2): positive amount, rejects zero, max 8 integer + 2 fractional digits.
  @Matches(/^(?!0+(?:\.0+)?$)\d{1,8}(?:\.\d{1,2})?$/, {
    message: 'price must be a positive decimal string with up to 2 decimal places',
  })
  price?: string;

  @ApiPropertyOptional({ example: '7c9e6679-7425-40de-944b-e07fc1f90ae7', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/images/acaraje.jpg',
    maxLength: 2000,
    nullable: true,
    description: 'Free-text URL. Send null to clear the image without the upload flow.',
  })
  // @IsOptional() lets an explicit null through, which is what we want here: the
  // column is nullable and clearing the image is a real operation.
  @IsOptional()
  @MaxLength(2000)
  @IsUrl()
  imageUrl?: string | null;

  // Carrier for the at-least-one rule. Never sent by clients; whitelist strips
  // unknown input keys, so it stays undefined and the rule reads the siblings.
  @AtLeastOneOf(['name', 'description', 'price', 'categoryId', 'imageUrl'])
  readonly _atLeastOneField?: never;
}
