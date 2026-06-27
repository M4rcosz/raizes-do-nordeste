import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  Matches,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// Cross-field rule: the decorated object must define at least one of `properties`.
// Attached to a carrier property that has no @IsOptional, so it runs even when
// every patchable field is absent (the case we need to reject).
function AtLeastOneOf(properties: string[], validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'atLeastOneOf',
      target: object.constructor,
      propertyName,
      constraints: properties,
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const target = args.object as Record<string, unknown>;
          return args.constraints.some((field: string) => target[field] !== undefined);
        },
        defaultMessage(args: ValidationArguments): string {
          return `At least one of [${args.constraints.join(', ')}] must be provided.`;
        },
      },
    });
  };
}

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
