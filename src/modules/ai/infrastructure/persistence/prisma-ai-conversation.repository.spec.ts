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
  title: 'Estoque Centro',
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
    // Two call shapes in this repo. appendMessages passes an ARRAY of operations and
    // never reads the result, so an empty array is enough. updateTitle passes a
    // CALLBACK, which has to actually run - handed the same mock as its tx client so
    // the delegate assertions below still see the calls.
    prisma.$transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : [],
    );
  });

  it('creates a thread owned by the user, already titled', async () => {
    prisma.aiConversation.create.mockResolvedValue(rawConversation);

    const conversation = await repo.create('user-1', 'Estoque Centro');

    // The title is written with the row, not patched in afterwards: the column is
    // NOT NULL, so there is no moment at which an untitled thread exists.
    expect(prisma.aiConversation.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', title: 'Estoque Centro' },
    });
    expect(conversation.id).toBe('conv-1');
    expect(conversation.title).toBe('Estoque Centro');
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

    await repo.listForUser('user-1', { take: 21, keyset: { timestamp: updatedAt, id: 'conv-9' } });

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

  it('filters by title with a case-insensitive substring match', async () => {
    prisma.aiConversation.findMany.mockResolvedValue([rawConversation]);

    await repo.listForUser('user-1', { take: 21, title: 'estoque' });

    const args = prisma.aiConversation.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.title).toEqual({ contains: 'estoque', mode: 'insensitive' });
    // The filter narrows the same scoped read; it does not replace the scoping.
    expect(args.where.userId).toBe('user-1');
    expect(args.where.deletedAt).toBeNull();
  });

  // Prisma compiles `contains` to LIKE '%' || $n || '%' and passes % and _ through
  // into the pattern verbatim (verified against Prisma 7.7.0 + adapter-pg). Without
  // escaping, a search for "100%" over-matches and a wildcard-dense term is far more
  // expensive to evaluate than its length suggests.
  it.each([
    ['the multi-character wildcard', '100%', '100\\%'],
    ['the single-character wildcard', 'a_b', 'a\\_b'],
    ['a backslash', 'a\\b', 'a\\\\b'],
  ])('escapes %s in the title filter', async (_label, term, expected) => {
    prisma.aiConversation.findMany.mockResolvedValue([]);

    await repo.listForUser('user-1', { take: 21, title: term });

    const args = prisma.aiConversation.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.title).toEqual({ contains: expected, mode: 'insensitive' });
  });

  it('omits the title predicate entirely when no term is given', async () => {
    prisma.aiConversation.findMany.mockResolvedValue([]);

    await repo.listForUser('user-1', { take: 21 });

    const args = prisma.aiConversation.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    // Not `contains: ''`, which would match everything by accident rather than by
    // decision and put a pointless ILIKE in the query plan.
    expect('title' in args.where).toBe(false);
  });

  it('combines the title filter with the keyset so a filtered result still pages', async () => {
    const updatedAt = new Date('2026-01-05T00:00:00.000Z');
    prisma.aiConversation.findMany.mockResolvedValue([]);

    await repo.listForUser('user-1', {
      take: 21,
      title: 'estoque',
      keyset: { timestamp: updatedAt, id: 'conv-9' },
    });

    const args = prisma.aiConversation.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.title).toEqual({ contains: 'estoque', mode: 'insensitive' });
    expect(args.where.OR).toEqual([
      { updatedAt: { lt: updatedAt } },
      { updatedAt, id: { lt: 'conv-9' } },
    ]);
  });

  it('renames only a live thread the user owns', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue(rawConversation);
    prisma.aiConversation.updateMany.mockResolvedValue({ count: 1 });

    const conversation = await repo.updateTitle('conv-1', 'user-1', 'Tapioca Boa Viagem');

    const args = prisma.aiConversation.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    // Ownership and liveness stay in the WHERE of the write, as softDelete does it.
    expect(args.where).toEqual({ id: 'conv-1', userId: 'user-1', deletedAt: null });
    expect(args.data.title).toBe('Tapioca Boa Viagem');
    expect(conversation?.title).toBe('Tapioca Boa Viagem');
  });

  // updatedAt is the keyset sort column and the listing's "last activity" contract.
  // Letting Prisma's @updatedAt stamp it here would jump a renamed thread to the top
  // of the list and re-serve it on a later page mid-pagination. The fake preserves it
  // too, so the two implementations agree.
  it('carries updatedAt over on rename instead of letting @updatedAt bump it', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue(rawConversation);
    prisma.aiConversation.updateMany.mockResolvedValue({ count: 1 });

    const conversation = await repo.updateTitle('conv-1', 'user-1', 'Tapioca Boa Viagem');

    const args = prisma.aiConversation.updateMany.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(args.data.updatedAt).toEqual(CREATED_AT);
    expect(conversation?.updatedAt).toEqual(CREATED_AT);
  });

  it('runs the rename read and write in one transaction', async () => {
    // As two loose statements a concurrent softDelete could land in between and make
    // a rename that HAD succeeded answer 404.
    prisma.aiConversation.findFirst.mockResolvedValue(rawConversation);
    prisma.aiConversation.updateMany.mockResolvedValue({ count: 1 });

    await repo.updateTitle('conv-1', 'user-1', 'Tapioca Boa Viagem');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(typeof prisma.$transaction.mock.calls[0]?.[0]).toBe('function');
  });

  it('scopes the rename read to live threads, unlike the delete re-read', async () => {
    // softDelete re-reads unfiltered to stay idempotent over an already-deleted
    // thread. A rename must not resurrect or even acknowledge one, so a deleted
    // thread comes back as null (404) and nothing is written.
    prisma.aiConversation.findFirst.mockResolvedValue(null);

    const conversation = await repo.updateTitle('conv-1', 'user-1', 'Novo titulo');

    expect(prisma.aiConversation.findFirst).toHaveBeenCalledWith({
      where: { id: 'conv-1', userId: 'user-1', deletedAt: null },
    });
    expect(prisma.aiConversation.updateMany).not.toHaveBeenCalled();
    expect(conversation).toBeNull();
  });

  it('reports not-found when the guarded write matches nothing', async () => {
    // The read saw a live thread but the guard did not match it - something changed
    // underneath. Answering null is what keeps the reply honest.
    prisma.aiConversation.findFirst.mockResolvedValue(rawConversation);
    prisma.aiConversation.updateMany.mockResolvedValue({ count: 0 });

    await expect(repo.updateTitle('conv-1', 'user-1', 'Novo titulo')).resolves.toBeNull();
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
