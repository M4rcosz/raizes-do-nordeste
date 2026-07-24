import { Inject, Injectable } from '@nestjs/common';
import { AiConversation } from '../../domain/entities/ai-conversation.entity';
import {
  AI_CONVERSATION_REPOSITORY,
  type AiConversationRepository,
} from '../../domain/repositories/ai-conversation.repository';
import {
  conversationTitleLength,
  MAX_CONVERSATION_TITLE_LENGTH,
  normalizeConversationTitle,
} from '../../domain/value-objects/conversation-title';
import { InvalidConversationTitleError } from '../../domain/errors/invalid-conversation-title.error';
import { AiConversationNotFoundError } from '../errors/ai-conversation-not-found.error';

export interface RenameConversationInput {
  conversationId: string;
  /** From the token. Renaming someone else's thread must read as not-found. */
  userId: string;
  title: string;
}

/**
 * Replaces the auto-derived title with one the owner chose. The derived title is only
 * ever a first guess - it is the opening message, which is often a poor name for where
 * the thread ended up - so a rename is what makes the title worth searching on.
 */
@Injectable()
export class RenameConversationUseCase {
  constructor(
    @Inject(AI_CONVERSATION_REPOSITORY)
    private readonly conversations: AiConversationRepository,
  ) {}

  async execute(input: RenameConversationInput): Promise<AiConversation> {
    // Normalized here and not only in the DTO, so a non-HTTP caller cannot store a
    // title with newlines in it and quietly break substring search for that row.
    const title = normalizeConversationTitle(input.title);
    if (title === '') {
      throw new InvalidConversationTitleError();
    }
    // Rejected, not truncated. Silently shortening a title someone typed is a worse
    // answer than telling them it was too long; the derive path truncates only
    // because nobody typed that title in the first place.
    if (conversationTitleLength(title) > MAX_CONVERSATION_TITLE_LENGTH) {
      throw new InvalidConversationTitleError(
        `A conversation title is limited to ${MAX_CONVERSATION_TITLE_LENGTH} characters.`,
      );
    }

    // The ownership check is inside the write itself (a conditional update scoped by
    // userId), not a read-then-write, so there is no window to slip through.
    const conversation = await this.conversations.updateTitle(
      input.conversationId,
      input.userId,
      title,
    );
    if (!conversation) {
      throw new AiConversationNotFoundError();
    }
    return conversation;
  }
}
