import { ApiProperty } from '@nestjs/swagger';
import { AiConversation } from '@modules/ai/domain/entities/ai-conversation.entity';
import { AiConversationMessageResponseDto } from './ai-conversation-message-response.dto';

/** A thread with its turns, oldest first. */
export class AiConversationDetailResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ description: 'Whether the thread has been deleted by its owner.' })
  readonly isDeleted!: boolean;

  @ApiProperty()
  readonly createdAt!: Date;

  @ApiProperty()
  readonly updatedAt!: Date;

  @ApiProperty({ type: [AiConversationMessageResponseDto] })
  readonly messages!: AiConversationMessageResponseDto[];

  static fromEntity(conversation: AiConversation): AiConversationDetailResponseDto {
    return Object.assign(new AiConversationDetailResponseDto(), {
      id: conversation.id,
      // The raw deletedAt stays internal; the wire contract is a plain flag.
      isDeleted: conversation.isDeleted,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages.map((message) =>
        AiConversationMessageResponseDto.fromEntity(message),
      ),
    });
  }
}
