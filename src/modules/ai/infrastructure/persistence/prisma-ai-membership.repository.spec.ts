import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { PrismaAiMembershipRepository } from './prisma-ai-membership.repository';

// Each delegate method is an async fn; `unknown` args/return keep the cast light while
// letting mockResolvedValue accept the raw Prisma rows.
type DelegateFn = jest.MockedFunction<(args?: unknown) => Promise<unknown>>;

type PrismaMock = {
  aiMembership: {
    findMany: DelegateFn;
    updateMany: DelegateFn;
  };
};

const delegateFn = (): DelegateFn => jest.fn() as DelegateFn;

const buildPrismaMock = (): PrismaMock => ({
  aiMembership: {
    findMany: delegateFn(),
    updateMany: delegateFn(),
  },
});

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

const rawMembership = {
  id: 'ai-1',
  userId: 'user-1',
  tokenBalance: 1000,
  revokedAt: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  updatedById: null,
};

describe('PrismaAiMembershipRepository', () => {
  let prisma: PrismaMock;
  let repo: PrismaAiMembershipRepository;

  beforeEach(() => {
    prisma = buildPrismaMock();
    repo = new PrismaAiMembershipRepository(prisma as unknown as PrismaService);
  });

  describe('listAll', () => {
    it('returns a page of memberships, revoked ones included', async () => {
      const revoked = { ...rawMembership, id: 'ai-2', userId: 'user-2', revokedAt: CREATED_AT };
      prisma.aiMembership.findMany.mockResolvedValue([rawMembership, revoked]);

      const memberships = await repo.listAll({ take: 21 });

      // No where clause: hiding revoked rows would under-report spend they already made.
      expect(prisma.aiMembership.findMany).toHaveBeenCalledWith({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      });
      expect(memberships.map((m) => m.userId)).toEqual(['user-1', 'user-2']);
      expect(memberships[1]?.isRevoked).toBe(true);
    });

    it('pages by comparing the sort key, never by a positional cursor', async () => {
      prisma.aiMembership.findMany.mockResolvedValue([]);

      await repo.listAll({ take: 21, keyset: { timestamp: CREATED_AT, id: 'ai-9' } });

      const args = prisma.aiMembership.findMany.mock.calls[0]?.[0] as {
        where?: Record<string, unknown>;
        cursor?: unknown;
        skip?: unknown;
      };
      expect(args.where?.OR).toEqual([
        { createdAt: { lt: CREATED_AT } },
        { createdAt: CREATED_AT, id: { lt: 'ai-9' } },
      ]);
      expect(args.cursor).toBeUndefined();
      expect(args.skip).toBeUndefined();
    });
  });

  describe('debit', () => {
    it('decrements under the revoked/balance guard', async () => {
      prisma.aiMembership.updateMany.mockResolvedValue({ count: 1 });

      await expect(repo.debit('user-1', 10)).resolves.toBe(true);

      expect(prisma.aiMembership.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null, tokenBalance: { gte: 10 } },
        data: { tokenBalance: { decrement: 10 } },
      });
    });

    it('reports false when the guard matched no row', async () => {
      prisma.aiMembership.updateMany.mockResolvedValue({ count: 0 });

      await expect(repo.debit('user-1', 10)).resolves.toBe(false);
    });

    it('rejects a non-positive amount without touching the database', async () => {
      await expect(repo.debit('user-1', 0)).resolves.toBe(false);
      await expect(repo.debit('user-1', -5)).resolves.toBe(false);
      await expect(repo.debit('user-1', 1.5)).resolves.toBe(false);
      expect(prisma.aiMembership.updateMany).not.toHaveBeenCalled();
    });

    it('spends on the caller transaction client when one is given', async () => {
      const txUpdateMany = delegateFn();
      txUpdateMany.mockResolvedValue({ count: 1 });
      const tx = { aiMembership: { updateMany: txUpdateMany } };

      await expect(repo.debit('user-1', 10, tx)).resolves.toBe(true);

      // The decrement and the usage-ledger row must commit together.
      expect(txUpdateMany).toHaveBeenCalled();
      expect(prisma.aiMembership.updateMany).not.toHaveBeenCalled();
    });
  });
});
