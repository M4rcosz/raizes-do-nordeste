import { ApiProperty } from '@nestjs/swagger';
import type { SendChatMessageResult } from '@modules/ai/application/use-cases/send-chat-message.use-case';

export class ChatResponseDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The thread this exchange belongs to. Send it back to continue the conversation.',
  })
  readonly conversationId!: string;

  @ApiProperty({
    example: 'Qual o estoque de tapioca na unidade Centro?',
    description:
      "The thread's title, derived from its opening message. Returned on every " +
      'exchange so a client never has to fetch it separately.',
  })
  readonly conversationTitle!: string;

  @ApiProperty({ description: 'The assistant reply.' })
  readonly reply!: string;

  @ApiProperty({ example: 320, description: 'Tokens metered for this exchange.' })
  readonly tokensSpent!: number;

  @ApiProperty({ example: 9680, description: 'Remaining AI token balance after this exchange.' })
  readonly balanceRemaining!: number;

  static fromResult(result: SendChatMessageResult): ChatResponseDto {
    return Object.assign(new ChatResponseDto(), {
      conversationId: result.conversationId,
      conversationTitle: result.conversationTitle,
      reply: result.reply,
      tokensSpent: result.tokensSpent,
      balanceRemaining: result.balanceRemaining,
    });
  }
}
