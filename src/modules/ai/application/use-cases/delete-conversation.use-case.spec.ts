import { beforeEach, describe, expect, it } from '@jest/globals';
import { AiConversationNotFoundError } from '../errors/ai-conversation-not-found.error';
import { DeleteConversationUseCase } from './delete-conversation.use-case';
import { FakeAiConversationRepository } from './__fakes__/ai-conversation-repository.fake';

describe('DeleteConversationUseCase', () => {
  let conversations: FakeAiConversationRepository;
  let useCase: DeleteConversationUseCase;

  beforeEach(() => {
    conversations = new FakeAiConversationRepository();
    useCase = new DeleteConversationUseCase(conversations);
  });

  it('soft-deletes the caller own thread', async () => {
    const created = await conversations.create('user-1', 'Existing thread');

    const deleted = await useCase.execute({ conversationId: created.id, userId: 'user-1' });

    expect(deleted.isDeleted).toBe(true);
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    // The row survives: only the ledger decides reported spend, and it must not be
    // contradicted by a missing thread.
    expect(conversations.all().map((c) => c.id)).toEqual([created.id]);
  });

  it('is idempotent and keeps the original timestamp', async () => {
    const created = await conversations.create('user-1', 'Existing thread');
    const first = await useCase.execute({ conversationId: created.id, userId: 'user-1' });

    const second = await useCase.execute({ conversationId: created.id, userId: 'user-1' });

    expect(second.deletedAt).toEqual(first.deletedAt);
  });

  it('refuses to delete a thread owned by someone else', async () => {
    const foreign = await conversations.create('someone-else', 'Their thread');

    await expect(
      useCase.execute({ conversationId: foreign.id, userId: 'user-1' }),
    ).rejects.toBeInstanceOf(AiConversationNotFoundError);
    expect(conversations.all()[0]?.isDeleted).toBe(false);
  });

  it('reports an unknown id as not found', async () => {
    await expect(
      useCase.execute({ conversationId: 'ghost', userId: 'user-1' }),
    ).rejects.toBeInstanceOf(AiConversationNotFoundError);
  });
});
