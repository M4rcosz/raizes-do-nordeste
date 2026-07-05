import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { AtLeastOneOf } from '@shared/validation/at-least-one-of';

// Partial update of a category's attributes. Every field is optional but at
// least one must be present. Unlike Product, isActive is editable here (the
// category has no separate activate/deactivate route). Timestamps are owned by
// persistence.
export class CategoryUpdateDto {
  @ApiPropertyOptional({ example: 'Bebidas', maxLength: 100 })
  @IsOptional()
  @MaxLength(100)
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: 'Sucos, refrigerantes e água',
    maxLength: 255,
  })
  @IsOptional()
  @MaxLength(255)
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Carrier for the at-least-one rule. Never sent by clients; whitelist strips
  // unknown input keys, so it stays undefined and the rule reads the siblings.
  @AtLeastOneOf(['name', 'description', 'isActive'])
  readonly _atLeastOneField?: never;
}
