import { Inject, Injectable } from '@nestjs/common';
import { buildCursorPage, type CursorPaginatedResult } from '@shared/pagination/pagination';
import { AiConversation } from '../../domain/entities/ai-conversation.entity';
import {
  AI_CONVERSATION_REPOSITORY,
  type AiConversationRepository,
} from '../../domain/repositories/ai-conversation.repository';
import { normalizeConversationTitle } from '../../domain/value-objects/conversation-title';
import { decodeAiKeysetCursor, encodeAiKeysetCursor } from '../ai-keyset-cursor';

export interface ListMyConversationsInput {
  /** From the token, never from the request. */
  userId: string;
  cursor?: string;
  limit: number;
  /** Case-insensitive substring of the title. Blank or absent means no filter. */
  title?: string;
}

/**
 * The caller's own threads, newest activity first, one page at a time. Self-scoped:
 * the userId comes from the token, so there is nothing to tamper with. Paginated
 * because every client that omits conversationId opens a new thread per message, so
 * this list grows without bound for an active user.
 *
 * Searching by title is a filter here rather than its own endpoint because titles are
 * not unique: two threads can legitimately share one, so "fetch by title" can only
 * honestly answer with a page. Putting it on the listing also means the search result
 * pages with the same keyset cursor instead of needing a second pagination story.
 */
@Injectable()
export class ListMyConversationsUseCase {
  constructor(
    @Inject(AI_CONVERSATION_REPOSITORY)
    private readonly conversations: AiConversationRepository,
  ) {}

  async execute(input: ListMyConversationsInput): Promise<CursorPaginatedResult<AiConversation>> {
    const { userId, cursor, limit } = input;

    // Decode before the fetch: a malformed token is the caller's error (422), not a
    // repository failure, and must not surface as an outage.
    const keyset = cursor === undefined ? undefined : decodeAiKeysetCursor(cursor);

    // A blank or whitespace-only search collapses to "no filter" rather than to
    // `contains: ''`. Both would match every row, but only one of them says so on
    // purpose - and the explicit undefined is what keeps the ILIKE out of the query.
    const title = normalizeConversationTitle(input.title ?? '') || undefined;

    // Over-fetch by one to detect a next page.
    const items = await this.conversations.listForUser(userId, {
      take: limit + 1,
      keyset,
      title,
    });

    // The next page's token carries the whole sort key, not just the id, so the keyset
    // predicate can be rebuilt without re-reading the row it points at.
    return buildCursorPage(items, limit, (conversation) =>
      encodeAiKeysetCursor(conversation.updatedAt, conversation.id),
    );
  }
}
