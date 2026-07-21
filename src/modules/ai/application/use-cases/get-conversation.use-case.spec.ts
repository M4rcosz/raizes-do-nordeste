import { beforeEach, describe, expect, it } from '@jest/globals';
import { AiMessageRole } from '@modules/ai/domain/value-objects/ai-message-role';
import { AiConversationNotFoundError } from '../errors/ai-conversation-not-found.error';
import { GetConversationUseCase } from './get-conversation.use-case';
import { FakeAiConversationRepository } from './__fakes__/ai-conversation-repository.fake';

describe('GetConversationUseCase', () => {
  let conversations: FakeAiConversationRepository;
  let useCase: GetConversationUseCase;

  beforeEach(() => {
    conversations = new FakeAiConversationRepository();
    useCase = new GetConversationUseCase(conversations);
  });

  it('returns the thread with its turns in order', async () => {
    const created = await conversations.create('user-1');
    await conversations.appendMessages(created.id, [
      { role: AiMessageRole.USER, content: 'hi' },
      { role: AiMessageRole.MODEL, content: 'hello' },
    ]);

    const conversation = await useCase.execute({
      conversationId: created.id,
      userId: 'user-1',
    });

    expect(conversation.messages.map((m) => m.content)).toEqual(['hi', 'hello']);
  });

  it('reports a thread owned by someone else as not found', async () => {
    // Not-found rather than forbidden: a foreign id must not be probeable.
    const created = await conversations.create('someone-else');

    await expect(
      useCase.execute({ conversationId: created.id, userId: 'user-1' }),
    ).rejects.toBeInstanceOf(AiConversationNotFoundError);
  });

  it('reports a soft-deleted thread as not found', async () => {
    const created = await conversations.create('user-1');
    await conversations.softDelete(created.id, 'user-1');

    await expect(
      useCase.execute({ conversationId: created.id, userId: 'user-1' }),
    ).rejects.toBeInstanceOf(AiConversationNotFoundError);
  });

  it('reports an unknown id as not found', async () => {
    await expect(
      useCase.execute({ conversationId: 'ghost', userId: 'user-1' }),
    ).rejects.toBeInstanceOf(AiConversationNotFoundError);
  });
});
