import { Inject, Injectable } from '@nestjs/common';
import { AiConversation } from '../../domain/entities/ai-conversation.entity';
import {
  AI_CONVERSATION_REPOSITORY,
  type AiConversationRepository,
} from '../../domain/repositories/ai-conversation.repository';
import { AiConversationNotFoundError } from '../errors/ai-conversation-not-found.error';

export interface DeleteConversationInput {
  conversationId: string;
  /** From the token. Deleting someone else's thread must read as not-found. */
  userId: string;
}

/**
 * Retires a thread by soft delete. The token spend it produced lives in its own
 * ledger and is untouched here: hiding a conversation never reduces reported spend.
 */
@Injectable()
export class DeleteConversationUseCase {
  constructor(
    @Inject(AI_CONVERSATION_REPOSITORY)
    private readonly conversations: AiConversationRepository,
  ) {}

  async execute(input: DeleteConversationInput): Promise<AiConversation> {
    // The ownership check is inside the write itself (a conditional update scoped
    // by userId), not a read-then-write, so there is no window to slip through.
    const conversation = await this.conversations.softDelete(input.conversationId, input.userId);
    if (!conversation) {
      throw new AiConversationNotFoundError();
    }
    return conversation;
  }
}
