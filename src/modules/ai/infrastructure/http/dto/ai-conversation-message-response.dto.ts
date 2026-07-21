import { ApiProperty } from '@nestjs/swagger';
import { AiConversationMessage } from '@modules/ai/domain/entities/ai-conversation-message.entity';
import { AiMessageRole } from '@modules/ai/domain/value-objects/ai-message-role';

export class AiConversationMessageResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ enum: Object.values(AiMessageRole) })
  readonly role!: AiMessageRole;

  @ApiProperty()
  readonly content!: string;

  @ApiProperty()
  readonly createdAt!: Date;

  static fromEntity(message: AiConversationMessage): AiConversationMessageResponseDto {
    return Object.assign(new AiConversationMessageResponseDto(), {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    });
  }
}
