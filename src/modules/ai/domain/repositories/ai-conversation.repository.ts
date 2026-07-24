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
  /**
   * Case-insensitive substring match on the title. Absent means no title filter at
   * all - an empty string is NOT the same thing and must never reach here, or it
   * would read as "match everything" by accident rather than by decision.
   */
  title?: string;
}

export interface AiConversationRepository {
  /** Opens an empty thread owned by `userId`, already titled. */
  create(userId: string, title: string): Promise<AiConversation>;
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
   * One page of the user's live threads, newest activity first, optionally narrowed
   * to those whose title contains `input.title`. Messages are not loaded. Over-fetch
   * by one (`take: limit + 1`) to detect a next page.
   */
  listForUser(userId: string, input: ListConversationsInput): Promise<AiConversation[]>;
  /**
   * Retitles a live thread under the same conditional guard the delete uses, so the
   * ownership check is inside the write rather than a read-then-write. Null means the
   * user has no such LIVE thread - unlike softDelete, a deleted thread is not
   * resurrectable by renaming it, so it reads as not-found.
   *
   * MUST leave updatedAt untouched. It is the listing's sort key and its documented
   * meaning is "last activity"; a rename is not activity, and bumping it would jump
   * the thread to the top of the list and re-serve it on a later page mid-pagination.
   */
  updateTitle(id: string, userId: string, title: string): Promise<AiConversation | null>;
  /**
   * Stamps deleted_at under a conditional guard (deleted_at IS NULL), then returns
   * the row as it now stands - including an already-deleted one, so a repeated
   * delete is idempotent instead of turning into a 404. Null means the user has no
   * such thread at all.
   */
  softDelete(id: string, userId: string): Promise<AiConversation | null>;
}

export const AI_CONVERSATION_REPOSITORY = Symbol('AiConversationRepository');
