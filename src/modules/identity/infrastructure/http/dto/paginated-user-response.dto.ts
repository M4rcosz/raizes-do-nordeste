import { ApiProperty } from '@nestjs/swagger';
import { CursorPaginationMetaDto } from '@shared/pagination/cursor-pagination-meta.dto';
import { UserResponseDto } from './user-response.dto';

/**
 * Schema-only DTO: never instantiated at runtime. It exists so Swagger can
 * describe the generic `PaginatedResponseDto<UserResponseDto>` returned by the
 * list endpoint (OpenAPI has no generics - a concrete class is needed).
 */
export class PaginatedUserResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  public readonly data!: UserResponseDto[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  public readonly meta!: CursorPaginationMetaDto;
}
