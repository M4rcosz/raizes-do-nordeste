import { ApiProperty } from '@nestjs/swagger';
import { CursorPaginationMetaDto } from '@shared/pagination/cursor-pagination-meta.dto';
import { AiConversationResponseDto } from './ai-conversation-response.dto';

/**
 * Schema-only DTO: never instantiated at runtime. It exists so Swagger can describe the
 * generic PaginatedResponseDto<AiConversationResponseDto> returned by the conversation
 * listing (OpenAPI has no generics - a concrete class is needed).
 */
export class PaginatedAiConversationResponseDto {
  @ApiProperty({ type: [AiConversationResponseDto] })
  public readonly data!: AiConversationResponseDto[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  public readonly meta!: CursorPaginationMetaDto;
}
