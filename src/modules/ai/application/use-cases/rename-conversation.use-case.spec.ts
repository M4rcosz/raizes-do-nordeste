import { beforeEach, describe, expect, it } from '@jest/globals';
import { InvalidConversationTitleError } from '../../domain/errors/invalid-conversation-title.error';
import { MAX_CONVERSATION_TITLE_LENGTH } from '../../domain/value-objects/conversation-title';
import { AiConversationNotFoundError } from '../errors/ai-conversation-not-found.error';
import { RenameConversationUseCase } from './rename-conversation.use-case';
import { FakeAiConversationRepository } from './__fakes__/ai-conversation-repository.fake';

describe('RenameConversationUseCase', () => {
  let conversations: FakeAiConversationRepository;
  let useCase: RenameConversationUseCase;

  beforeEach(() => {
    conversations = new FakeAiConversationRepository();
    useCase = new RenameConversationUseCase(conversations);
  });

  it('replaces the title of the caller own thread', async () => {
    const created = await conversations.create('user-1', 'Qual o estoque de tapioca?');

    const renamed = await useCase.execute({
      conversationId: created.id,
      userId: 'user-1',
      title: 'Estoque Centro',
    });

    expect(renamed.title).toBe('Estoque Centro');
  });

  it('persists the rename, so a later read sees the new title', async () => {
    const created = await conversations.create('user-1', 'Qual o estoque de tapioca?');

    await useCase.execute({
      conversationId: created.id,
      userId: 'user-1',
      title: 'Estoque Centro',
    });

    const reread = await conversations.findByIdForUser(created.id, 'user-1');
    expect(reread?.title).toBe('Estoque Centro');
  });

  // Normalized in the use case and not only in the DTO, so a non-HTTP caller cannot
  // store a title with newlines and quietly break substring search for that row.
  it('normalizes the title before storing it', async () => {
    const created = await conversations.create('user-1', 'Original');

    const renamed = await useCase.execute({
      conversationId: created.id,
      userId: 'user-1',
      title: '  Estoque\n\tCentro  ',
    });

    expect(renamed.title).toBe('Estoque Centro');
  });

  it('rejects a whitespace-only title, which @IsNotEmpty alone would let through', async () => {
    const created = await conversations.create('user-1', 'Original');

    await expect(
      useCase.execute({ conversationId: created.id, userId: 'user-1', title: '   ' }),
    ).rejects.toBeInstanceOf(InvalidConversationTitleError);
  });

  it('leaves the existing title intact when the rename is rejected', async () => {
    const created = await conversations.create('user-1', 'Original');

    await useCase
      .execute({ conversationId: created.id, userId: 'user-1', title: '   ' })
      .catch(() => undefined);

    const reread = await conversations.findByIdForUser(created.id, 'user-1');
    expect(reread?.title).toBe('Original');
  });

  it('accepts a title sitting exactly on the cap', async () => {
    const created = await conversations.create('user-1', 'Original');
    const exact = 'a'.repeat(MAX_CONVERSATION_TITLE_LENGTH);

    const renamed = await useCase.execute({
      conversationId: created.id,
      userId: 'user-1',
      title: exact,
    });

    expect(renamed.title).toBe(exact);
  });

  // Rejected rather than truncated: silently shortening what someone typed is worse
  // than telling them. The derive path truncates only because nobody typed it.
  it('rejects an over-long title instead of truncating it', async () => {
    const created = await conversations.create('user-1', 'Original');

    await expect(
      useCase.execute({
        conversationId: created.id,
        userId: 'user-1',
        title: 'a'.repeat(MAX_CONVERSATION_TITLE_LENGTH + 1),
      }),
    ).rejects.toBeInstanceOf(InvalidConversationTitleError);
  });

  // Length is counted in code points, matching the derive path. String.length would
  // count each emoji twice and reject a title the derivation would have produced.
  it('measures the cap in code points, not UTF-16 units', async () => {
    const created = await conversations.create('user-1', 'Original');
    const emoji = '🌵'.repeat(MAX_CONVERSATION_TITLE_LENGTH);

    const renamed = await useCase.execute({
      conversationId: created.id,
      userId: 'user-1',
      title: emoji,
    });

    expect(renamed.title).toBe(emoji);
  });

  // updatedAt is the listing's sort key and its documented meaning is "last activity".
  // A rename is not activity: bumping it would jump the thread to the top of the list
  // and re-serve it on a later page mid-pagination.
  it('does not count a rename as activity', async () => {
    const created = await conversations.create('user-1', 'Original');

    const renamed = await useCase.execute({
      conversationId: created.id,
      userId: 'user-1',
      title: 'Estoque Centro',
    });

    expect(renamed.updatedAt).toEqual(created.updatedAt);
  });

  it('answers not-found for someone else thread, so an id cannot be probed', async () => {
    const foreign = await conversations.create('someone-else', 'Their thread');

    await expect(
      useCase.execute({ conversationId: foreign.id, userId: 'user-1', title: 'Meu' }),
    ).rejects.toBeInstanceOf(AiConversationNotFoundError);
  });

  it('never touches someone else thread when the rename is refused', async () => {
    const foreign = await conversations.create('someone-else', 'Their thread');

    await useCase
      .execute({ conversationId: foreign.id, userId: 'user-1', title: 'Meu' })
      .catch(() => undefined);

    const reread = await conversations.findByIdForUser(foreign.id, 'someone-else');
    expect(reread?.title).toBe('Their thread');
  });

  it('answers not-found for an unknown id', async () => {
    await expect(
      useCase.execute({ conversationId: 'nope', userId: 'user-1', title: 'Meu' }),
    ).rejects.toBeInstanceOf(AiConversationNotFoundError);
  });

  // Unlike delete, which stays idempotent over an already-deleted thread, a rename
  // must not resurrect or even acknowledge one.
  it('answers not-found for a soft-deleted thread', async () => {
    const created = await conversations.create('user-1', 'Original');
    await conversations.softDelete(created.id, 'user-1');

    await expect(
      useCase.execute({ conversationId: created.id, userId: 'user-1', title: 'Estoque' }),
    ).rejects.toBeInstanceOf(AiConversationNotFoundError);
  });
});
