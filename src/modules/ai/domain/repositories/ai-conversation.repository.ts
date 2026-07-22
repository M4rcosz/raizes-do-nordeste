import type { TimestampKeyset } from '@shared/pagination/keyset-cursor';
import { AiConversation } from '../entities/ai-conversation.entity';
import { AiMessageRole } from '../value-objects/ai-message-role';

/** A turn to append. Ids and timestamps are the database's business. */
export interface AppendMessageInput {
  role: AiMessageRole;
  content: string;
}

/**
 * Deliberately NOT CursorPaginationParams: `keyset` is the sort key of the previous
 * page's last row, not a row id to seek to. updatedAt moves on every appended turn, so
 * a positional cursor would shift and drop rows. Here the keyset timestamp is updatedAt.
 */
export interface ListConversationsInput {
  take: number;
  keyset?: TimestampKeyset;
}

export interface AiConversationRepository {
  /** Opens an empty thread owned by `userId`. */
  create(userId: string): Promise<AiConversation>;
  /**
   * Appends turns in the given order. Also touches the thread's updatedAt so the
   * listing can order by "last activity" rather than by creation.
   */
  appendMessages(conversationId: string, messages: AppendMessageInput[]): Promise<void>;
  /**
   * Loads one thread with its messages, scoped to its owner. Soft-deleted threads
   * are invisible here: the caller sees exactly the same null a foreign or unknown
   * id produces, so nothing leaks about someone else's thread.
   *
   * `messageLimit` keeps only the LAST N turns (still returned oldest-first). The
   * model-replay path passes it so an old thread cannot assemble an unbounded prompt;
   * the human read path omits it and gets the whole thread.
   */
  findByIdForUser(
    id: string,
    userId: string,
    messageLimit?: number,
  ): Promise<AiConversation | null>;
  /**
   * One page of the user's live threads, newest activity first. Messages are not
   * loaded. Over-fetch by one (`take: limit + 1`) to detect a next page.
   */
  listForUser(userId: string, input: ListConversationsInput): Promise<AiConversation[]>;
  /**
   * Stamps deleted_at under a conditional guard (deleted_at IS NULL), then returns
   * the row as it now stands - including an already-deleted one, so a repeated
   * delete is idempotent instead of turning into a 404. Null means the user has no
   * such thread at all.
   */
  softDelete(id: string, userId: string): Promise<AiConversation | null>;
}

export const AI_CONVERSATION_REPOSITORY = Symbol('AiConversationRepository');
