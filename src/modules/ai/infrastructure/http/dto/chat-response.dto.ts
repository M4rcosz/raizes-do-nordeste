import { ApiProperty } from '@nestjs/swagger';
import type { SendChatMessageResult } from '@modules/ai/application/use-cases/send-chat-message.use-case';

export class ChatResponseDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The thread this exchange belongs to. Send it back to continue the conversation.',
  })
  readonly conversationId!: string;

  @ApiProperty({ description: 'The assistant reply.' })
  readonly reply!: string;

  @ApiProperty({ example: 320, description: 'Tokens metered for this exchange.' })
  readonly tokensSpent!: number;

  @ApiProperty({ example: 9680, description: 'Remaining AI token balance after this exchange.' })
  readonly balanceRemaining!: number;

  static fromResult(result: SendChatMessageResult): ChatResponseDto {
    return Object.assign(new ChatResponseDto(), {
      conversationId: result.conversationId,
      reply: result.reply,
      tokensSpent: result.tokensSpent,
      balanceRemaining: result.balanceRemaining,
    });
  }
}
