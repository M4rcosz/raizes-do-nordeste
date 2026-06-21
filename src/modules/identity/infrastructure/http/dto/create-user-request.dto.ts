import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';

// Administrative creation. @Roles gates ADMIN/MANAGER at the controller; the
// domain policy in the use case decides which target roles each may create.
export class CreateUserDto {
  @ApiProperty({ example: 'João Atendente', maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'joao.atendente', minLength: 3, maxLength: 50 })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  // username is @unique and the login key. Reject whitespace/uppercase/empty so
  // "joao" and "Joao " cannot become distinct accounts. Validate only, no transform.
  @Matches(/^[a-z0-9._-]+$/, {
    message: 'username must be lowercase alphanumeric with . _ or -',
  })
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

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  businessUnitId?: string;
}
