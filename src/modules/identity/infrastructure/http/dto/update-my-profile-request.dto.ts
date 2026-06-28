import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  registerDecorator,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Rejects a body that carries neither name nor phone; avoids a no-op PATCH.
@ValidatorConstraint({ name: 'atLeastOneProfileField', async: false })
class AtLeastOneProfileFieldConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as Record<string, unknown>;
    const fields = args.constraints as string[];
    return fields.some((f) => obj[f] !== undefined);
  }

  defaultMessage(args: ValidationArguments): string {
    const fields = args.constraints as string[];
    return `At least one of (${fields.join(', ')}) must be provided.`;
  }
}

// Class-level decorator: registers the constraint against a synthetic property
// so class-validator runs it when validating the DTO instance.
function AtLeastOneOf(fields: string[]) {
  return function (target: object): void {
    registerDecorator({
      target: target.constructor,
      propertyName: '_atLeastOneOf',
      constraints: fields,
      validator: AtLeastOneProfileFieldConstraint,
    });
  };
}

@AtLeastOneOf(['name', 'phone'])
export class UpdateMyProfileDto {
  @ApiPropertyOptional({ example: 'Maria Souza', maxLength: 120 })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: '+5581999999999', maxLength: 20 })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
