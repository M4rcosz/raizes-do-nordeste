import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import {
  RESERVED_USERNAMES,
  RESERVED_USERNAME_MESSAGE,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
  USERNAME_PATTERN_MESSAGE,
} from '@modules/identity/domain/value-objects/username';

// Administrative creation. @Roles gates ADMIN/MANAGER at the controller; the
// domain policy in the use case decides which target roles each may create.
export class CreateUserDto {
  @ApiProperty({ example: 'João Atendente', maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: 'joao.atendente',
    minLength: USERNAME_MIN_LENGTH,
    maxLength: USERNAME_MAX_LENGTH,
  })
  @IsString()
  @MinLength(USERNAME_MIN_LENGTH)
  @MaxLength(USERNAME_MAX_LENGTH)
  // username is @unique and the login key. Reject whitespace/uppercase/empty so
  // "joao" and "Joao " cannot become distinct accounts. Validate only, no transform.
  @Matches(USERNAME_PATTERN, { message: USERNAME_PATTERN_MESSAGE })
  @IsNotIn(RESERVED_USERNAMES, { message: RESERVED_USERNAME_MESSAGE })
  username!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.ATTENDANT })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiPropertyOptional({ example: 'joao@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+5581988888888', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Units this staff member is scoped to. Omit/empty for an unbound user.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  businessUnitIds?: string[];
}
