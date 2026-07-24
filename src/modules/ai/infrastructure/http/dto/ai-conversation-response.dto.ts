import { ApiProperty } from '@nestjs/swagger';
import { AiConversation } from '@modules/ai/domain/entities/ai-conversation.entity';

/** Thread summary, without its turns. Used by the listing and by the delete reply. */
export class AiConversationResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({
    example: 'Qual o estoque de tapioca na unidade Centro?',
    description:
      'Derived from the opening message, or whatever the owner renamed it to. Never null.',
  })
  readonly title!: string;

  @ApiProperty({ description: 'Whether the thread has been deleted by its owner.' })
  readonly isDeleted!: boolean;

  @ApiProperty()
  readonly createdAt!: Date;

  @ApiProperty({ description: 'Last activity, which is what the listing is ordered by.' })
  readonly updatedAt!: Date;

  static fromEntity(conversation: AiConversation): AiConversationResponseDto {
    return Object.assign(new AiConversationResponseDto(), {
      id: conversation.id,
      title: conversation.title,
      // The raw deletedAt stays internal; the wire contract is a plain flag.
      isDeleted: conversation.isDeleted,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    });
  }
}
