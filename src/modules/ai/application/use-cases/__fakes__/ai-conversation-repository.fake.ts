import { AiConversation } from '@modules/ai/domain/entities/ai-conversation.entity';
import { AiConversationMessage } from '@modules/ai/domain/entities/ai-conversation-message.entity';
import {
  AiConversationRepository,
  AppendMessageInput,
  ListConversationsInput,
} from '@modules/ai/domain/repositories/ai-conversation.repository';

/**
 * In-memory AiConversationRepository fake. Models the behavior the use cases rely
 * on: reads scoped to the owner, soft-deleted threads invisible to reads, and an
 * idempotent delete that still returns the row.
 */
export class FakeAiConversationRepository implements AiConversationRepository {
  private readonly store = new Map<string, AiConversation>();
  private seq = 0;
  private messageSeq = 0;

  seed(conversation: AiConversation): void {
    this.store.set(conversation.id, conversation);
  }

  /** Every thread, deleted ones included. Lets a test look behind the soft delete. */
  all(): AiConversation[] {
    return [...this.store.values()];
  }

  create(userId: string, title: string): Promise<AiConversation> {
    const now = new Date();
    const conversation = new AiConversation(`conv-${++this.seq}`, userId, title, now, now);
    this.store.set(conversation.id, conversation);
    return Promise.resolve(conversation);
  }

  appendMessages(conversationId: string, messages: AppendMessageInput[]): Promise<void> {
    const current = this.store.get(conversationId);
    if (!current) {
      return Promise.reject(new Error(`No conversation ${conversationId} to append to.`));
    }
    const appended = messages.map(
      (message) =>
        new AiConversationMessage(
          `msg-${++this.messageSeq}`,
          conversationId,
          message.role,
          message.content,
          new Date(),
        ),
    );
    this.store.set(
      conversationId,
      new AiConversation(
        current.id,
        current.userId,
        current.title,
        current.createdAt,
        new Date(),
        current.deletedAt,
        [...current.messages, ...appended],
      ),
    );
    return Promise.resolve();
  }

  findByIdForUser(
    id: string,
    userId: string,
    messageLimit?: number,
  ): Promise<AiConversation | null> {
    const current = this.store.get(id);
    // Mirror the real query: a foreign or deleted thread is indistinguishable from
    // a nonexistent one.
    if (!current || !current.isOwnedBy(userId) || current.isDeleted) {
      return Promise.resolve(null);
    }
    if (messageLimit === undefined) {
      return Promise.resolve(current);
    }
    // Same last-N-still-ascending semantics as the real query, or the cap would
    // never actually be exercised by a spec.
    return Promise.resolve(
      new AiConversation(
        current.id,
        current.userId,
        current.title,
        current.createdAt,
        current.updatedAt,
        current.deletedAt,
        current.messages.slice(-messageLimit),
      ),
    );
  }

  listForUser(userId: string, input: ListConversationsInput): Promise<AiConversation[]> {
    const { take, keyset, title } = input;
    const rows = [...this.store.values()]
      .filter((c) => c.isOwnedBy(userId) && !c.isDeleted)
      // Mirrors `contains` + `mode: 'insensitive'`: substring, case-folded.
      .filter((c) => title === undefined || c.title.toLowerCase().includes(title.toLowerCase()))
      // (updatedAt desc, id desc), same as the real ordering.
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : -1))
      // Keyset predicate: strictly after the given sort key, never a position.
      .filter(
        (c) =>
          keyset === undefined ||
          c.updatedAt < keyset.timestamp ||
          (c.updatedAt.getTime() === keyset.timestamp.getTime() && c.id < keyset.id),
      )
      .slice(0, take);
    return Promise.resolve(rows);
  }

  updateTitle(id: string, userId: string, title: string): Promise<AiConversation | null> {
    const current = this.store.get(id);
    // Mirrors the guarded write: a deleted thread is not renamable and reads as
    // not-found, unlike softDelete which stays idempotent over one.
    if (!current || !current.isOwnedBy(userId) || current.isDeleted) {
      return Promise.resolve(null);
    }
    // rename() preserves updatedAt, which is what the real repository does too (it
    // passes the current value explicitly to override Prisma's @updatedAt). Keep the
    // two in step: a fake that bumped it here would hide a reordering bug.
    const renamed = current.rename(title);
    this.store.set(id, renamed);
    return Promise.resolve(renamed);
  }

  softDelete(id: string, userId: string): Promise<AiConversation | null> {
    const current = this.store.get(id);
    if (!current || !current.isOwnedBy(userId)) {
      return Promise.resolve(null);
    }
    // Idempotent: an already-deleted thread keeps its timestamp and still comes back.
    const deleted = current.softDelete();
    this.store.set(id, deleted);
    return Promise.resolve(deleted);
  }
}
