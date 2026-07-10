import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { IsStrongPassword } from './is-strong-password';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@modules/identity/domain/value-objects/password-policy';

export class ChangeMyPasswordDto {
  @ApiProperty({ example: 'OldPass!2024', maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @ApiProperty({
    example: 'N3w-Str0ng-Pass!',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsStrongPassword()
  newPassword!: string;
}
