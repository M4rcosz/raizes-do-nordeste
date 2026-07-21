import { Inject, Injectable } from '@nestjs/common';
import { AiConversation } from '../../domain/entities/ai-conversation.entity';
import {
  AI_CONVERSATION_REPOSITORY,
  type AiConversationRepository,
} from '../../domain/repositories/ai-conversation.repository';
import { AiConversationNotFoundError } from '../errors/ai-conversation-not-found.error';

export interface GetConversationInput {
  conversationId: string;
  /** From the token. A thread belonging to anyone else must read as not-found. */
  userId: string;
}

@Injectable()
export class GetConversationUseCase {
  constructor(
    @Inject(AI_CONVERSATION_REPOSITORY)
    private readonly conversations: AiConversationRepository,
  ) {}

  async execute(input: GetConversationInput): Promise<AiConversation> {
    const conversation = await this.conversations.findByIdForUser(
      input.conversationId,
      input.userId,
    );
    // The repo already scopes by owner and hides deleted threads, so a null here
    // covers "not yours", "deleted" and "never existed" with one indistinguishable
    // answer - a foreign id cannot be probed for existence.
    if (!conversation) {
      throw new AiConversationNotFoundError();
    }
    return conversation;
  }
}
