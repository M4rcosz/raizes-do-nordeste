import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

// Cross-field rule: the decorated object must define at least one of `properties`.
// Attach it to a carrier property that has no @IsOptional, so it runs even when
// every patchable field is absent (the case we need to reject).
export function AtLeastOneOf(properties: string[], validationOptions?: ValidationOptions) {
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
