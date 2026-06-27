import { ApiProperty } from '@nestjs/swagger';
import { CursorPaginationMetaDto } from '@shared/pagination/cursor-pagination-meta.dto';
import { MenuItemResponseDto } from './menu-item-response.dto';

/**
 * Schema-only DTO: never instantiated at runtime. It exists so Swagger can
 * describe the generic `PaginatedResponseDto<MenuItemResponseDto>` returned by
 * the management list endpoint (OpenAPI has no generics - a concrete class is needed).
 */
export class PaginatedMenuItemResponseDto {
  @ApiProperty({ type: [MenuItemResponseDto] })
  public readonly data!: MenuItemResponseDto[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  public readonly meta!: CursorPaginationMetaDto;
}
