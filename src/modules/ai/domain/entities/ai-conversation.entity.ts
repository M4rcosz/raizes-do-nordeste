import { AiConversationMessage } from './ai-conversation-message.entity';

/**
 * A chat thread. Aggregate root: messages are only ever reached through it, and a
 * thread is retired by soft delete so the token spend it produced (an independent
 * ledger) is never contradicted by a missing row.
 */
export class AiConversation {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    /**
     * Always present. Derived from the opening message at creation and replaceable by
     * the owner, so there is no untitled state for a listing to render around.
     */
    public readonly title: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly deletedAt: Date | null = null,
    /** Empty on a listing read; populated only when the thread is loaded in full. */
    public readonly messages: readonly AiConversationMessage[] = [],
  ) {}

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  /**
   * Every read and write of a thread is scoped to its owner. Answering "not mine"
   * here lets the callers return not-found instead of forbidden, so a foreign id
   * cannot be probed for existence.
   */
  isOwnedBy(userId: string): boolean {
    return this.userId === userId;
  }

  /**
   * Retitles the thread. The caller normalizes first (see `conversation-title`); this
   * only carries the new value. The real write is the repo's conditional update, so
   * this mirrors it for the domain and for unit tests.
   */
  rename(title: string): AiConversation {
    return new AiConversation(
      this.id,
      this.userId,
      title,
      this.createdAt,
      this.updatedAt,
      this.deletedAt,
      this.messages,
    );
  }

  /**
   * Stamps the thread as deleted. Idempotent: an already-deleted thread keeps its
   * original timestamp, so a repeated delete cannot rewrite when it happened. The
   * real write is the repo's conditional update (deleted_at IS NULL); this mirrors
   * it for the domain and for unit tests.
   */
  softDelete(at: Date = new Date()): AiConversation {
    return new AiConversation(
      this.id,
      this.userId,
      this.title,
      this.createdAt,
      this.updatedAt,
      this.deletedAt ?? at,
      this.messages,
    );
  }
}
