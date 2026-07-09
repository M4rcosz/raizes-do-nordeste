import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { USERNAME_LOGIN_MAX_LENGTH } from '@modules/identity/domain/value-objects/username';

export class SignInDto {
  // Normalize, do not reject: registration is a deliberate act and earns a 400 on
  // a malformed username, but login is typed in a hurry on a keyboard that
  // autocapitalizes. citext already makes the lookup case-insensitive; the
  // toLowerCase keeps the value we write to the audit log canonical. citext does
  // not ignore whitespace, so the trim is on us.
  // `value` is typed `any` by class-transformer; narrow it to unknown so the
  // string guard below is real and no `any` escapes.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  // An uncapped username lands in the failed-login audit metadata and gets
  // persisted; the body-parser limit was the only bound before this. This cap is a
  // safety bound, not the registration limit: enforcing the stricter rule here
  // would lock out any account created before the rule, with no way to rename.
  @MaxLength(USERNAME_LOGIN_MAX_LENGTH)
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
