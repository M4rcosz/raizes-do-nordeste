import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, Matches } from 'class-validator';
import { AtLeastOneOf } from '@shared/validation/at-least-one-of';

export class MenuItemUpdateDto {
  @ApiPropertyOptional({
    example: '18.50',
    description: 'Positive decimal string with up to 2 fractional digits (DB Decimal(10,2)).',
  })
  @IsOptional()
  @Matches(/^(?!0+(?:\.0+)?$)\d{1,8}(?:\.\d{1,2})?$/, {
    message: 'customPrice must be a positive decimal string with up to 2 decimal places',
  })
  customPrice?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isAvailable?: boolean;

  // Carrier for the at-least-one rule. Never sent by clients; whitelist strips
  // unknown input keys, so it stays undefined and the rule reads the siblings.
  @AtLeastOneOf(['customPrice', 'isAvailable'])
  readonly _atLeastOneField?: never;
}
