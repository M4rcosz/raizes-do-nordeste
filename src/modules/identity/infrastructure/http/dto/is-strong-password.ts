import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  hasEnoughCharacterClasses,
  PASSWORD_STRENGTH_MESSAGE,
} from '@modules/identity/domain/value-objects/password-policy';

// class-validator adapter for the domain password-strength rule. Length is enforced
// separately by @MinLength/@MaxLength so each failure gets its own clear message.
@ValidatorConstraint({ name: 'strongPassword', async: false })
class StrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && hasEnoughCharacterClasses(value);
  }

  defaultMessage(): string {
    return PASSWORD_STRENGTH_MESSAGE;
  }
}

// Property-level decorator: registers the constraint so class-validator runs it
// against the decorated field.
export function IsStrongPassword(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: StrongPasswordConstraint,
    });
  };
}
