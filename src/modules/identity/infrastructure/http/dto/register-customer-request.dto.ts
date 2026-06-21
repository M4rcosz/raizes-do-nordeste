import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

// Self-registration payload. No role field on purpose: the use case always
// forces CUSTOMER, so a client cannot grant itself a privileged role.
export class RegisterCustomerDto {
  @ApiProperty({ example: 'Maria Souza', maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'maria.souza', minLength: 3, maxLength: 50 })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  // username is @unique and the login key. Reject whitespace/uppercase/empty so
  // "maria" and "Maria " cannot become distinct accounts. Validate only, no transform.
  @Matches(/^[a-z0-9._-]+$/, {
    message: 'username must be lowercase alphanumeric with . _ or -',
  })
  username!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ example: 'maria@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+5581999999999', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
