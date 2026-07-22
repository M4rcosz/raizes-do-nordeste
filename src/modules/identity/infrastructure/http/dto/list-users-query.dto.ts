import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { MAX_CURSOR_LENGTH } from '@shared/pagination/pagination';

export class ListUsersQueryDto {
  @ApiPropertyOptional({
    example: 20,
    minimum: 1,
    maximum: 100,
    description: 'Items per page (default 20, max 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Cursor from the previous page. Opaque base64url keyset token - pass it back ' +
      'verbatim. A malformed cursor returns 422.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CURSOR_LENGTH)
  cursor?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filter by business unit. MANAGER is restricted to their own units.',
  })
  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  @ApiPropertyOptional({ example: 'joao', description: 'Case-insensitive username substring' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  username?: string;

  @ApiPropertyOptional({ example: 'joao@', description: 'Case-insensitive email substring' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;

  @ApiPropertyOptional({
    enum: UserRole,
    description:
      'Filter by exact role. Combines with the unit scope, so a MANAGER asking for CUSTOMER gets an empty page.',
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
