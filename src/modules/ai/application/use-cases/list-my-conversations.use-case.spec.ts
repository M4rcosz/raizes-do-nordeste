import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AiConversation } from '@modules/ai/domain/entities/ai-conversation.entity';
import { InvalidAiCursorError } from '../errors/invalid-ai-cursor.error';
import { decodeAiKeysetCursor, encodeAiKeysetCursor } from '../ai-keyset-cursor';
import { ListMyConversationsUseCase } from './list-my-conversations.use-case';
import { FakeAiConversationRepository } from './__fakes__/ai-conversation-repository.fake';

// Distinct instants so the ordering is unambiguous; the higher the day, the newer.
const AT = (day: number): Date => new Date(`2026-01-0${day}T00:00:00.000Z`);

function conversation(
  id: string,
  userId: string,
  updatedAt: Date,
  title = 'Untitled thread',
): AiConversation {
  return new AiConversation(id, userId, title, AT(1), updatedAt);
}

describe('ListMyConversationsUseCase', () => {
  let conversations: FakeAiConversationRepository;
  let useCase: ListMyConversationsUseCase;

  beforeEach(() => {
    conversations = new FakeAiConversationRepository();
    useCase = new ListMyConversationsUseCase(conversations);
  });

  it('returns the caller own threads, newest activity first', async () => {
    conversations.seed(conversation('conv-1', 'user-1', AT(2)));
    conversations.seed(conversation('conv-2', 'user-1', AT(3)));

    const result = await useCase.execute({ userId: 'user-1', limit: 20 });

    expect(result.data.map((c) => c.id)).toEqual(['conv-2', 'conv-1']);
  });

  it('never returns someone else threads', async () => {
    conversations.seed(conversation('conv-1', 'someone-else', AT(2)));

    const result = await useCase.execute({ userId: 'user-1', limit: 20 });

    expect(result.data).toEqual([]);
  });

  it('hides soft-deleted threads', async () => {
    conversations.seed(conversation('conv-1', 'user-1', AT(2)));
    await conversations.softDelete('conv-1', 'user-1');

    const result = await useCase.execute({ userId: 'user-1', limit: 20 });

    expect(result.data).toEqual([]);
  });

  it('cuts the page at the limit and hands back a usable cursor', async () => {
    conversations.seed(conversation('conv-1', 'user-1', AT(1)));
    conversations.seed(conversation('conv-2', 'user-1', AT(2)));
    conversations.seed(conversation('conv-3', 'user-1', AT(3)));

    const result = await useCase.execute({ userId: 'user-1', limit: 2 });

    expect(result.data.map((c) => c.id)).toEqual(['conv-3', 'conv-2']);
    expect(result.meta.hasMore).toBe(true);
    // The token carries the whole sort key, so the next page needs no re-read of the
    // row it points at.
    expect(decodeAiKeysetCursor(result.meta.nextCursor!)).toEqual({
      timestamp: AT(2),
      id: 'conv-2',
    });
  });

  it('following the cursor yields the next page with no duplicate and no gap', async () => {
    conversations.seed(conversation('conv-1', 'user-1', AT(1)));
    conversations.seed(conversation('conv-2', 'user-1', AT(2)));
    conversations.seed(conversation('conv-3', 'user-1', AT(3)));

    const first = await useCase.execute({ userId: 'user-1', limit: 2 });
    const second = await useCase.execute({
      userId: 'user-1',
      limit: 2,
      cursor: first.meta.nextCursor!,
    });

    expect(second.data.map((c) => c.id)).toEqual(['conv-1']);
    expect(second.meta.hasMore).toBe(false);
    expect(second.meta.nextCursor).toBeNull();
    // Every row seen exactly once across the two pages.
    expect([...first.data, ...second.data].map((c) => c.id)).toEqual([
      'conv-3',
      'conv-2',
      'conv-1',
    ]);
  });

  it('keeps paging correct when the cursor thread moves to the top', async () => {
    // The keyset payoff: updatedAt mutates on every appended turn, so the row a
    // positional cursor named would have shifted and eaten a neighbour. Comparing
    // values instead means the moved row is simply no longer behind the key.
    conversations.seed(conversation('conv-1', 'user-1', AT(1)));
    conversations.seed(conversation('conv-2', 'user-1', AT(2)));
    conversations.seed(conversation('conv-3', 'user-1', AT(3)));

    const first = await useCase.execute({ userId: 'user-1', limit: 2 });
    // conv-2 (the cursor row) gets a new turn and jumps ahead of everything.
    conversations.seed(conversation('conv-2', 'user-1', AT(9)));
    const second = await useCase.execute({
      userId: 'user-1',
      limit: 2,
      cursor: first.meta.nextCursor!,
    });

    // conv-1 is still delivered: it never depended on conv-2 holding its place.
    expect(second.data.map((c) => c.id)).toEqual(['conv-1']);
  });

  describe('title filter', () => {
    beforeEach(() => {
      conversations.seed(conversation('conv-1', 'user-1', AT(1), 'Estoque de tapioca'));
      conversations.seed(conversation('conv-2', 'user-1', AT(2), 'Pedidos de ontem'));
      conversations.seed(conversation('conv-3', 'user-1', AT(3), 'ESTOQUE do Centro'));
    });

    it('narrows the page to titles containing the term', async () => {
      const result = await useCase.execute({ userId: 'user-1', limit: 20, title: 'estoque' });

      expect(result.data.map((c) => c.id)).toEqual(['conv-3', 'conv-1']);
    });

    it('matches case-insensitively, so the caller does not have to know the casing', async () => {
      const result = await useCase.execute({ userId: 'user-1', limit: 20, title: 'ESTOQUE' });

      expect(result.data.map((c) => c.id)).toEqual(['conv-3', 'conv-1']);
    });

    it('matches a substring, not just a prefix', async () => {
      const result = await useCase.execute({ userId: 'user-1', limit: 20, title: 'tapioca' });

      expect(result.data.map((c) => c.id)).toEqual(['conv-1']);
    });

    it('returns an empty page rather than an error when nothing matches', async () => {
      const result = await useCase.execute({ userId: 'user-1', limit: 20, title: 'inexistente' });

      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });

    // The reason this is a listing filter and not a "get by title" route.
    it('returns every thread sharing a title, never just one', async () => {
      conversations.seed(conversation('conv-4', 'user-1', AT(4), 'Estoque de tapioca'));

      const result = await useCase.execute({
        userId: 'user-1',
        limit: 20,
        title: 'Estoque de tapioca',
      });

      expect(result.data.map((c) => c.id)).toEqual(['conv-4', 'conv-1']);
    });

    it('never reaches another user threads through the filter', async () => {
      conversations.seed(conversation('conv-9', 'someone-else', AT(9), 'Estoque secreto'));

      const result = await useCase.execute({ userId: 'user-1', limit: 20, title: 'estoque' });

      expect(result.data.map((c) => c.id)).toEqual(['conv-3', 'conv-1']);
    });

    it('hides soft-deleted threads from the filter too', async () => {
      await conversations.softDelete('conv-3', 'user-1');

      const result = await useCase.execute({ userId: 'user-1', limit: 20, title: 'estoque' });

      expect(result.data.map((c) => c.id)).toEqual(['conv-1']);
    });

    // A blank term must collapse to "no filter", not to `contains: ''`. Both match
    // everything, but only the explicit undefined keeps the ILIKE out of the query.
    it.each([
      ['an empty string', ''],
      ['whitespace only', '   '],
    ])('treats %s as no filter at all', async (_label, title) => {
      const listForUser = jest.spyOn(conversations, 'listForUser');

      const result = await useCase.execute({ userId: 'user-1', limit: 20, title });

      expect(result.data).toHaveLength(3);
      expect(listForUser.mock.calls[0]?.[1].title).toBeUndefined();
    });

    it('normalizes the term before matching, so a padded search still hits', async () => {
      const result = await useCase.execute({ userId: 'user-1', limit: 20, title: '  estoque  ' });

      expect(result.data.map((c) => c.id)).toEqual(['conv-3', 'conv-1']);
    });

    // The filter narrows the set the keyset pages over; it does not replace it.
    it('pages a filtered result with the same cursor', async () => {
      const first = await useCase.execute({ userId: 'user-1', limit: 1, title: 'estoque' });

      expect(first.data.map((c) => c.id)).toEqual(['conv-3']);
      expect(first.meta.hasMore).toBe(true);

      const second = await useCase.execute({
        userId: 'user-1',
        limit: 1,
        title: 'estoque',
        cursor: first.meta.nextCursor!,
      });

      expect(second.data.map((c) => c.id)).toEqual(['conv-1']);
      expect(second.meta.hasMore).toBe(false);
    });
  });

  it('rejects a malformed cursor as invalid input, not as an outage', async () => {
    await expect(
      useCase.execute({ userId: 'user-1', limit: 20, cursor: 'not-a-real-token' }),
    ).rejects.toBeInstanceOf(InvalidAiCursorError);
  });

  it('rejects a cursor whose payload is structurally wrong', async () => {
    const forged = Buffer.from(JSON.stringify({ id: 'conv-1' }), 'utf8').toString('base64url');

    await expect(
      useCase.execute({ userId: 'user-1', limit: 20, cursor: forged }),
    ).rejects.toBeInstanceOf(InvalidAiCursorError);
  });

  it('never reaches the repository when the cursor is malformed', async () => {
    const listForUser = jest.spyOn(conversations, 'listForUser');

    await useCase.execute({ userId: 'user-1', limit: 20, cursor: '!!!' }).catch(() => undefined);

    expect(listForUser).not.toHaveBeenCalled();
  });

  it('round-trips a cursor through encode and decode', () => {
    const token = encodeAiKeysetCursor(AT(3), 'conv-3');

    expect(decodeAiKeysetCursor(token)).toEqual({ timestamp: AT(3), id: 'conv-3' });
  });
});
