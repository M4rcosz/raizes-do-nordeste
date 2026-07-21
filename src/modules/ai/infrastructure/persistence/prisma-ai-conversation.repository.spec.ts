import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { AiMessageRole } from '@modules/ai/domain/value-objects/ai-message-role';
import { PrismaAiConversationRepository } from './prisma-ai-conversation.repository';

// Each delegate method is an async fn; `unknown` args/return keep the cast light while
// letting mockResolvedValue accept the raw Prisma rows.
type DelegateFn = jest.MockedFunction<(args?: unknown) => Promise<unknown>>;

type PrismaMock = {
  aiConversation: {
    create: DelegateFn;
    findFirst: DelegateFn;
    findMany: DelegateFn;
    update: DelegateFn;
    updateMany: DelegateFn;
  };
  aiConversationMessage: {
    createMany: DelegateFn;
  };
  $transaction: DelegateFn;
};

const delegateFn = (): DelegateFn => jest.fn() as DelegateFn;

const buildPrismaMock = (): PrismaMock => ({
  aiConversation: {
    create: delegateFn(),
    findFirst: delegateFn(),
    findMany: delegateFn(),
    update: delegateFn(),
    updateMany: delegateFn(),
  },
  aiConversationMessage: {
    createMany: delegateFn(),
  },
  $transaction: delegateFn(),
});

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

const rawConversation = {
  id: 'conv-1',
  userId: 'user-1',
  deletedAt: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

describe('PrismaAiConversationRepository', () => {
  let prisma: PrismaMock;
  let repo: PrismaAiConversationRepository;

  beforeEach(() => {
    prisma = buildPrismaMock();
    repo = new PrismaAiConversationRepository(prisma as unknown as PrismaService);
    // The array form resolves whatever the batched operations resolve; the repo
    // never reads the result, so an empty array is enough.
    prisma.$transaction.mockResolvedValue([]);
  });

  it('creates a thread owned by the user', async () => {
    prisma.aiConversation.create.mockResolvedValue(rawConversation);

    const conversation = await repo.create('user-1');

    expect(prisma.aiConversation.create).toHaveBeenCalledWith({ data: { userId: 'user-1' } });
    expect(conversation.id).toBe('conv-1');
    expect(conversation.isDeleted).toBe(false);
    expect(conversation.messages).toEqual([]);
  });

  it('appends turns and bumps the thread in one transaction', async () => {
    await repo.appendMessages('conv-1', [
      { role: AiMessageRole.USER, content: 'hi' },
      { role: AiMessageRole.MODEL, content: 'hello' },
    ]);

    expect(prisma.aiConversationMessage.createMany).toHaveBeenCalledWith({
      data: [
        { conversationId: 'conv-1', role: 'USER', content: 'hi' },
        { conversationId: 'conv-1', role: 'MODEL', content: 'hello' },
      ],
    });
    expect(prisma.aiConversation.update).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('writes nothing for an empty append', async () => {
    await repo.appendMessages('conv-1', []);

    expect(prisma.aiConversationMessage.createMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('scopes the single read to the owner and to live threads', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue({
      ...rawConversation,
      messages: [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'USER',
          content: 'hi',
          createdAt: CREATED_AT,
        },
      ],
    });

    const conversation = await repo.findByIdForUser('conv-1', 'user-1');

    expect(prisma.aiConversation.findFirst).toHaveBeenCalledWith({
      where: { id: 'conv-1', userId: 'user-1', deletedAt: null },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    expect(conversation?.messages).toHaveLength(1);
    expect(conversation?.messages[0]?.role).toBe(AiMessageRole.USER);
  });

  it('returns null when the thread is not the user own', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue(null);

    await expect(repo.findByIdForUser('conv-1', 'someone-else')).resolves.toBeNull();
  });

  it('loads the LAST n turns descending and flips them back to ascending', async () => {
    // There is no "last N ascending" in SQL, so the limited read takes the newest N
    // and reverses. The caller must still see the turns oldest-first or the replayed
    // conversation would be backwards.
    const message = (id: string, content: string, at: string): Record<string, unknown> => ({
      id,
      conversationId: 'conv-1',
      role: 'USER',
      content,
      createdAt: new Date(at),
    });
    prisma.aiConversation.findFirst.mockResolvedValue({
      ...rawConversation,
      messages: [
        message('msg-3', 'third', '2026-01-03T00:00:00.000Z'),
        message('msg-2', 'second', '2026-01-02T00:00:00.000Z'),
      ],
    });

    const conversation = await repo.findByIdForUser('conv-1', 'user-1', 2);

    expect(prisma.aiConversation.findFirst).toHaveBeenCalledWith({
      where: { id: 'conv-1', userId: 'user-1', deletedAt: null },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 2 } },
    });
    expect(conversation?.messages.map((m) => m.content)).toEqual(['second', 'third']);
  });

  it('lists only live threads, newest activity first', async () => {
    prisma.aiConversation.findMany.mockResolvedValue([rawConversation]);

    const conversations = await repo.listForUser('user-1', { take: 21 });

    expect(prisma.aiConversation.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 21,
    });
    expect(conversations).toHaveLength(1);
  });

  it('pages by comparing the sort key, never by a positional cursor', async () => {
    // updatedAt moves on every appended turn, so a Prisma cursor would name a row that
    // has since left its position and skip:1 would eat a different thread.
    const updatedAt = new Date('2026-01-05T00:00:00.000Z');
    prisma.aiConversation.findMany.mockResolvedValue([]);

    await repo.listForUser('user-1', { take: 21, keyset: { updatedAt, id: 'conv-9' } });

    const args = prisma.aiConversation.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      cursor?: unknown;
      skip?: unknown;
    };
    expect(args.where.OR).toEqual([
      { updatedAt: { lt: updatedAt } },
      { updatedAt, id: { lt: 'conv-9' } },
    ]);
    expect(args.cursor).toBeUndefined();
    expect(args.skip).toBeUndefined();
  });

  it('stamps deleted_at only on a live thread and returns the row as it now stands', async () => {
    const deletedAt = new Date('2026-02-01T00:00:00.000Z');
    prisma.aiConversation.updateMany.mockResolvedValue({ count: 1 });
    prisma.aiConversation.findFirst.mockResolvedValue({ ...rawConversation, deletedAt });

    const conversation = await repo.softDelete('conv-1', 'user-1');

    const updateArgs = prisma.aiConversation.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(updateArgs.where).toEqual({ id: 'conv-1', userId: 'user-1', deletedAt: null });
    // The re-read is NOT filtered by deletedAt, which is what makes a repeated
    // delete idempotent instead of a 404.
    expect(prisma.aiConversation.findFirst).toHaveBeenCalledWith({
      where: { id: 'conv-1', userId: 'user-1' },
    });
    expect(conversation?.isDeleted).toBe(true);
  });

  it('returns null when the user has no such thread to delete', async () => {
    prisma.aiConversation.updateMany.mockResolvedValue({ count: 0 });
    prisma.aiConversation.findFirst.mockResolvedValue(null);

    await expect(repo.softDelete('conv-1', 'user-1')).resolves.toBeNull();
  });
});
