import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';

// Full REPLACE of a staff member's unit scope. The set must be non-empty: to
// strip every unit, deactivate the user instead.
export class UpdateUserBusinessUnitsDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'The exact set of units the user is scoped to (replaces the current set)',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  businessUnitIds!: string[];
}
