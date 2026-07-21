import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@shared/auth/current-user.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { sanitizeLimit } from '@shared/pagination/pagination';
import { ListMyConversationsUseCase } from '@modules/ai/application/use-cases/list-my-conversations.use-case';
import { GetConversationUseCase } from '@modules/ai/application/use-cases/get-conversation.use-case';
import { DeleteConversationUseCase } from '@modules/ai/application/use-cases/delete-conversation.use-case';
import { AiConversationParamDto } from '../dto/ai-conversation-param.dto';
import { AiConversationResponseDto } from '../dto/ai-conversation-response.dto';
import { AiConversationDetailResponseDto } from '../dto/ai-conversation-detail-response.dto';
import { PaginatedAiConversationResponseDto } from '../dto/paginated-ai-conversation-response.dto';
import { ListConversationsQueryDto } from '../dto/list-conversations-query.dto';

// Every route is self-scoped: the owner comes from the token, never from the request,
// and a thread belonging to anyone else answers 404 rather than 403 so ids cannot be
// probed. No @Roles gate - any authenticated user owns their own threads.
// TODO(test): route wiring (param binding, scoping) covered by e2e once migrated.
@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/conversations')
export class AiConversationController {
  constructor(
    private readonly listMyConversations: ListMyConversationsUseCase,
    private readonly getConversation: GetConversationUseCase,
    private readonly deleteConversation: DeleteConversationUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List your assistant conversations, newest activity first.' })
  @ApiOkResponse({ type: PaginatedAiConversationResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'Malformed pagination cursor.' })
  async list(
    @Query() query: ListConversationsQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaginatedResponseDto<AiConversationResponseDto>> {
    const result = await this.listMyConversations.execute({
      userId: user.sub,
      cursor: query.cursor,
      limit: sanitizeLimit(query.limit),
    });
    return new PaginatedResponseDto(
      result.data.map((conversation) => AiConversationResponseDto.fromEntity(conversation)),
      result.meta,
    );
  }

  // Human read path: no message cap, so a user still reads their whole thread. The
  // cap exists only on the model-replay path, where prompt size costs tokens.
  @Get(':conversationId')
  @ApiOperation({ summary: 'Read one of your conversations with its turns.' })
  @ApiOkResponse({ type: AiConversationDetailResponseDto })
  @ApiNotFoundResponse({ description: 'No such conversation for this user.' })
  async get(
    @Param() { conversationId }: AiConversationParamDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AiConversationDetailResponseDto> {
    const conversation = await this.getConversation.execute({ conversationId, userId: user.sub });
    return AiConversationDetailResponseDto.fromEntity(conversation);
  }

  @Delete(':conversationId')
  @ApiOperation({
    summary: 'Delete one of your conversations. Token spend already reported is unaffected.',
  })
  @ApiOkResponse({ type: AiConversationResponseDto })
  @ApiNotFoundResponse({ description: 'No such conversation for this user.' })
  async remove(
    @Param() { conversationId }: AiConversationParamDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AiConversationResponseDto> {
    const conversation = await this.deleteConversation.execute({
      conversationId,
      userId: user.sub,
    });
    return AiConversationResponseDto.fromEntity(conversation);
  }
}
