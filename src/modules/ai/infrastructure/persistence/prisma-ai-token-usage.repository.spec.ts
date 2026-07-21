import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { PrismaAiTokenUsageRepository } from './prisma-ai-token-usage.repository';

// Each delegate method is an async fn; `unknown` args/return keep the cast light while
// letting mockResolvedValue accept the raw Prisma rows.
type DelegateFn = jest.MockedFunction<(args?: unknown) => Promise<unknown>>;

type PrismaMock = {
  aiTokenUsage: {
    create: DelegateFn;
    groupBy: DelegateFn;
  };
};

const delegateFn = (): DelegateFn => jest.fn() as DelegateFn;

const buildPrismaMock = (): PrismaMock => ({
  aiTokenUsage: {
    create: delegateFn(),
    groupBy: delegateFn(),
  },
});

const FROM = new Date('2026-01-01T00:00:00.000Z');
const TO = new Date('2026-01-31T23:59:59.999Z');

describe('PrismaAiTokenUsageRepository', () => {
  let prisma: PrismaMock;
  let repo: PrismaAiTokenUsageRepository;

  beforeEach(() => {
    prisma = buildPrismaMock();
    repo = new PrismaAiTokenUsageRepository(prisma as unknown as PrismaService);
  });

  it('appends a ledger row', async () => {
    prisma.aiTokenUsage.create.mockResolvedValue({});

    await repo.record({ userId: 'user-1', conversationId: 'conv-1', tokensUsed: 42 });

    expect(prisma.aiTokenUsage.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', conversationId: 'conv-1', tokensUsed: 42 },
    });
  });

  it('records spend that belongs to no thread', async () => {
    prisma.aiTokenUsage.create.mockResolvedValue({});

    await repo.record({ userId: 'user-1', conversationId: null, tokensUsed: 7 });

    expect(prisma.aiTokenUsage.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', conversationId: null, tokensUsed: 7 },
    });
  });

  it('writes on the caller transaction client when one is given', async () => {
    const txCreate = delegateFn();
    txCreate.mockResolvedValue({});
    const tx = { aiTokenUsage: { create: txCreate } };

    await repo.record({ userId: 'user-1', conversationId: null, tokensUsed: 5 }, tx);

    // The debit and this row must commit together, so the tx client has to be used
    // rather than the ambient connection.
    expect(txCreate).toHaveBeenCalled();
    expect(prisma.aiTokenUsage.create).not.toHaveBeenCalled();
  });

  it('aggregates the period in a single grouped query', async () => {
    prisma.aiTokenUsage.groupBy.mockResolvedValue([
      { userId: 'user-1', _sum: { tokensUsed: 120 } },
      { userId: 'user-2', _sum: { tokensUsed: 5 } },
    ]);

    const totals = await repo.sumByUserInPeriod(['user-1', 'user-2'], FROM, TO);

    expect(prisma.aiTokenUsage.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.aiTokenUsage.groupBy).toHaveBeenCalledWith({
      by: ['userId'],
      where: { userId: { in: ['user-1', 'user-2'] }, createdAt: { gte: FROM, lte: TO } },
      _sum: { tokensUsed: true },
    });
    expect(totals).toEqual([
      { userId: 'user-1', tokensUsed: 120 },
      { userId: 'user-2', tokensUsed: 5 },
    ]);
  });

  it('treats a null sum as zero', async () => {
    prisma.aiTokenUsage.groupBy.mockResolvedValue([
      { userId: 'user-1', _sum: { tokensUsed: null } },
    ]);

    await expect(repo.sumByUserInPeriod(['user-1'], FROM, TO)).resolves.toEqual([
      { userId: 'user-1', tokensUsed: 0 },
    ]);
  });

  it('does not query at all for an empty user list', async () => {
    await expect(repo.sumByUserInPeriod([], FROM, TO)).resolves.toEqual([]);
    expect(prisma.aiTokenUsage.groupBy).not.toHaveBeenCalled();
  });
});
