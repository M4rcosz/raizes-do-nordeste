import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  RESERVED_USERNAMES,
  RESERVED_USERNAME_MESSAGE,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
  USERNAME_PATTERN_MESSAGE,
} from '@modules/identity/domain/value-objects/username';
import { IsStrongPassword } from './is-strong-password';
import { NormalizeEmail } from './normalize-email';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_STRENGTH_MESSAGE,
} from '@modules/identity/domain/value-objects/password-policy';
import { EMAIL_MAX_LENGTH } from '@modules/identity/domain/value-objects/email-normalization';

// Self-registration payload. No role field on purpose: the use case always
// forces CUSTOMER, so a client cannot grant itself a privileged role.
export class RegisterCustomerDto {
  @ApiProperty({ example: 'Maria Souza', maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: 'maria.souza',
    minLength: USERNAME_MIN_LENGTH,
    maxLength: USERNAME_MAX_LENGTH,
  })
  @IsString()
  @MinLength(USERNAME_MIN_LENGTH)
  @MaxLength(USERNAME_MAX_LENGTH)
  // username is @unique and the login key. Reject whitespace/uppercase/empty so
  // "maria" and "Maria " cannot become distinct accounts. Validate only, no transform.
  @Matches(USERNAME_PATTERN, { message: USERNAME_PATTERN_MESSAGE })
  @IsNotIn(RESERVED_USERNAMES, { message: RESERVED_USERNAME_MESSAGE })
  username!: string;

  @ApiProperty({
    example: 'Sup3r!Secret',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description: PASSWORD_STRENGTH_MESSAGE,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @IsStrongPassword()
  password!: string;

  @ApiPropertyOptional({ example: 'maria@example.com', maxLength: EMAIL_MAX_LENGTH })
  @IsOptional()
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email?: string;

  @ApiPropertyOptional({ example: '+5581999999999', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
