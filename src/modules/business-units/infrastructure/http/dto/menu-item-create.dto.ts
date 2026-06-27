import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID, Matches } from 'class-validator';

export class MenuItemCreateDto {
  @ApiProperty({ example: '7c9e6679-7425-40de-944b-e07fc1f90ae7', format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({
    example: '18.50',
    description: 'Positive decimal string with up to 2 fractional digits (DB Decimal(10,2)).',
  })
  // Matches DB Decimal(10,2): positive amount, rejects zero, max 8 integer + 2 fractional digits.
  @Matches(/^(?!0+(?:\.0+)?$)\d{1,8}(?:\.\d{1,2})?$/, {
    message: 'customPrice must be a positive decimal string with up to 2 decimal places',
  })
  customPrice!: string;

  @ApiPropertyOptional({ example: true, description: 'Defaults to true when omitted.' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isAvailable?: boolean;
}
