import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_CURSOR_LENGTH } from '@shared/pagination/pagination';
import { MAX_CONVERSATION_TITLE_LENGTH } from '@modules/ai/domain/value-objects/conversation-title';

export class ListConversationsQueryDto {
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
    example: 'estoque',
    maxLength: MAX_CONVERSATION_TITLE_LENGTH,
    description:
      'Case-insensitive substring of the title. Titles are not unique, so this ' +
      'narrows the page rather than resolving one thread. Pages with the same cursor.',
  })
  @IsOptional()
  @IsString()
  // Bounded by the longest title that can exist: a search term longer than any
  // storable title can only ever match nothing, so accepting it just buys an ILIKE
  // that is guaranteed to scan for no reason.
  @MaxLength(MAX_CONVERSATION_TITLE_LENGTH)
  title?: string;
}
