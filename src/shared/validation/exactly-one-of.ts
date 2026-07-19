import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

// Cross-field rule: the decorated object must define exactly one of `properties`.
// Sibling of AtLeastOneOf, for the mutually-exclusive case (pick a phone OR an
// email, never both). Attach it to a carrier property with no @IsOptional, so it
// runs even when every listed field is absent (one of the two cases we reject).
export function ExactlyOneOf(properties: string[], validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'exactlyOneOf',
      target: object.constructor,
      propertyName,
      constraints: properties,
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const target = args.object as Record<string, unknown>;
          const present = args.constraints.filter(
            (field: string) => target[field] !== undefined,
          ).length;
          return present === 1;
        },
        defaultMessage(args: ValidationArguments): string {
          return `Exactly one of [${args.constraints.join(', ')}] must be provided.`;
        },
      },
    });
  };
}
