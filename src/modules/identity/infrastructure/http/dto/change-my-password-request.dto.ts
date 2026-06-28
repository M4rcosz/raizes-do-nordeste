import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// A strong password must mix at least this many of the four character classes.
const MIN_CHARACTER_CLASSES = 3;
const CHARACTER_CLASSES = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/];

// Counts how many of (lowercase, uppercase, digit, symbol) the value uses and
// requires at least MIN_CHARACTER_CLASSES of them. Length is enforced separately
// by @MinLength/@MaxLength so each failure gets its own clear message.
@ValidatorConstraint({ name: 'strongPassword', async: false })
class StrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    const matched = CHARACTER_CLASSES.filter((re) => re.test(value)).length;
    return matched >= MIN_CHARACTER_CLASSES;
  }

  defaultMessage(): string {
    return `Password must combine at least ${MIN_CHARACTER_CLASSES} of: lowercase, uppercase, digit, symbol.`;
  }
}

// Property-level decorator mirroring the @AtLeastOneOf style: registers the
// constraint so class-validator runs it against the decorated field.
function IsStrongPassword(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: StrongPasswordConstraint,
    });
  };
}

export class ChangeMyPasswordDto {
  @ApiProperty({ example: 'OldPass!2024', maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ example: 'N3w-Str0ng-Pass!', minLength: 10, maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(128)
  @IsStrongPassword()
  newPassword!: string;
}
