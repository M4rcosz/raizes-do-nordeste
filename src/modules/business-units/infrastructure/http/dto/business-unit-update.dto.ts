import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { AtLeastOneOf } from '@shared/validation/at-least-one-of';

// Partial update of a unit's contact attributes. Every field is optional but at
// least one must be present. cnpj is immutable (fiscal identity) and isActive
// is not editable here (it has its own activate/deactivate routes).
// We use @ValidateIf(present) instead of @IsOptional so an explicit null still
// runs the validators (@IsOptional skips both undefined and null). This keeps a
// { "field": null } body a 400 at the border instead of a 500 from Prisma.
export class BusinessUnitUpdateDto {
  @ApiPropertyOptional({ example: 'Nexio Pelourinho', maxLength: 120 })
  @ValidateIf((obj: BusinessUnitUpdateDto) => obj.name !== undefined)
  @MaxLength(120)
  @IsNotEmpty()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Largo do Pelourinho, 10', maxLength: 255 })
  @ValidateIf((obj: BusinessUnitUpdateDto) => obj.address !== undefined)
  @MaxLength(255)
  @IsNotEmpty()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Salvador', maxLength: 120 })
  @ValidateIf((obj: BusinessUnitUpdateDto) => obj.city !== undefined)
  @MaxLength(120)
  @IsNotEmpty()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: '7132223344', maxLength: 20 })
  @ValidateIf((obj: BusinessUnitUpdateDto) => obj.phone !== undefined)
  @MaxLength(20)
  @IsNotEmpty()
  @IsString()
  phone?: string;

  // Carrier for the at-least-one rule. Never sent by clients; whitelist strips
  // unknown input keys, so it stays undefined and the rule reads the siblings.
  @AtLeastOneOf(['name', 'address', 'city', 'phone'])
  readonly _atLeastOneField?: never;
}
