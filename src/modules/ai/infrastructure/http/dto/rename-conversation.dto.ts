import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';
import {
  MAX_CONVERSATION_TITLE_LENGTH,
  normalizeConversationTitle,
} from '@modules/ai/domain/value-objects/conversation-title';

export class RenameConversationDto {
  @ApiProperty({
    example: 'Estoque Centro',
    maxLength: MAX_CONVERSATION_TITLE_LENGTH,
    description:
      'New title. Whitespace is collapsed and trimmed before it is stored. Blank or ' +
      `over ${MAX_CONVERSATION_TITLE_LENGTH} characters is rejected with 422.`,
  })
  // Type only. The blank and length rules live in RenameConversationUseCase and are
  // DELIBERATELY not repeated here: with @IsNotEmpty/@MaxLength the pipe answered 400
  // first and the domain's 422 became unreachable, so one rule had two owners that
  // disagreed on the status code. @MaxLength also counts UTF-16 units while the
  // domain counts code points, which rejected an 80-emoji title the derive path is
  // happy to produce. One owner, one unit, one status.
  //
  // Unbounded input is still bounded: the body parser caps the payload long before a
  // title of any plausible size, and the normalization below is a single linear pass.
  @IsString()
  // Normalized before the use case sees it, reusing the same domain function the
  // derive path uses - that is what keeps the two ways a title can be written from
  // producing different shapes. The typeof guard is for a non-string payload, which
  // reaches the transform before @IsString has had a chance to reject it.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeConversationTitle(value) : value,
  )
  title!: string;
}
