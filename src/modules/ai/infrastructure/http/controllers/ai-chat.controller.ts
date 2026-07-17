import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@shared/auth/current-user.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { SendChatMessageUseCase } from '@modules/ai/application/use-cases/send-chat-message.use-case';
import type { ActorContext } from '@modules/ai/application/actor-context';
import type { ChatMessage } from '@modules/ai/application/ports/chat-model.port';
import { SendChatMessageDto } from '../dto/send-chat-message.dto';
import { ChatResponseDto } from '../dto/chat-response.dto';

// Any authenticated user may chat; enrollment and token balance are enforced in the
// use case (403 not-enrolled / 403 out-of-tokens), so no @Roles gate here.
@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/chat')
export class AiChatController {
  constructor(private readonly sendChatMessage: SendChatMessageUseCase) {}

  // Every call spends real provider money and the entry balance check is a soft
  // ceiling (concurrent requests can each hit the provider before a debit lands),
  // so this endpoint is throttled tighter than the global default.
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Post()
  @ApiOperation({ summary: 'Ask the support assistant a question. Metered against AI tokens.' })
  @ApiOkResponse({ type: ChatResponseDto })
  @ApiForbiddenResponse({ description: 'Not enrolled for AI access, or out of tokens.' })
  @ApiServiceUnavailableResponse({ description: 'The assistant is temporarily unavailable.' })
  async chat(
    @Body() body: SendChatMessageDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ChatResponseDto> {
    const actor: ActorContext = {
      userId: user.sub,
      role: user.role,
      businessUnitIds: user.businessUnitIds,
    };
    const history: ChatMessage[] = (body.history ?? []).map((m) => ({
      role: m.role,
      text: m.text,
    }));
    const result = await this.sendChatMessage.execute({ actor, history, message: body.message });
    return ChatResponseDto.fromResult(result);
  }
}
