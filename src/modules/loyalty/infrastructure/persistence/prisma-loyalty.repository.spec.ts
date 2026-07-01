import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { PrismaLoyaltyRepository } from './prisma-loyalty.repository';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { LoyaltyTransactionType } from '@modules/loyalty/domain/value-objects/loyalty-transaction-type';
import { PointsRedemptionConflictError } from '@modules/loyalty/application/errors/points-redemption-conflict.error';

// Each delegate method is an async fn; `unknown` args/return keep the cast light while
// letting mockResolvedValue accept the raw Prisma rows.
type DelegateFn = jest.MockedFunction<(args?: unknown) => Promise<unknown>>;

type PrismaMock = {
  loyaltyAccount: {
    findUnique: DelegateFn;
    findMany: DelegateFn;
    create: DelegateFn;
    update: DelegateFn;
    updateMany: DelegateFn;
  };
  loyaltyTransaction: {
    create: DelegateFn;
    findMany: DelegateFn;
  };
};

const delegateFn = (): DelegateFn => jest.fn() as DelegateFn;

const buildPrismaMock = (): PrismaMock => ({
  loyaltyAccount: {
    findUnique: delegateFn(),
    findMany: delegateFn(),
    create: delegateFn(),
    update: delegateFn(),
    updateMany: delegateFn(),
  },
  loyaltyTransaction: {
    create: delegateFn(),
    findMany: delegateFn(),
  },
});

const rawAccount = {
  id: 'la-1',
  customerId: 'c-1',
  totalPoints: 10,
  consentGiven: true,
  consentDate: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  updatedById: null,
};

describe('PrismaLoyaltyRepository', () => {
  let prisma: PrismaMock;
  let repo: PrismaLoyaltyRepository;

  beforeEach(() => {
    prisma = buildPrismaMock();
    repo = new PrismaLoyaltyRepository(prisma as unknown as PrismaService);
  });

  it('finds an account by customer id mapped to a domain entity', async () => {
    prisma.loyaltyAccount.findUnique.mockResolvedValue(rawAccount);

    const result = await repo.findByCustomerId('c-1');

    expect(prisma.loyaltyAccount.findUnique).toHaveBeenCalledWith({
      where: { customerId: 'c-1' },
    });
    expect(result?.id).toBe('la-1');
    expect(result?.totalPoints).toBe(10);
    expect(result?.consentGiven).toBe(true);
  });

  it('returns null when the customer has no account', async () => {
    prisma.loyaltyAccount.findUnique.mockResolvedValue(null);

    expect(await repo.findByCustomerId('c-x')).toBeNull();
  });

  describe('createIfAbsent', () => {
    it('creates the account with the schema defaults', async () => {
      prisma.loyaltyAccount.create.mockResolvedValue(rawAccount);

      await repo.createIfAbsent('c-1');

      expect(prisma.loyaltyAccount.create).toHaveBeenCalledWith({
        data: { customerId: 'c-1' },
      });
    });

    it('swallows a unique-violation race (P2002) as a no-op', async () => {
      prisma.loyaltyAccount.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '7' }),
      );

      await expect(repo.createIfAbsent('c-1')).resolves.toBeUndefined();
    });

    it('rethrows any other persistence failure', async () => {
      const boom = new Error('db down');
      prisma.loyaltyAccount.create.mockRejectedValue(boom);

      await expect(repo.createIfAbsent('c-1')).rejects.toBe(boom);
    });
  });

  describe('earn', () => {
    it('records the EARN transaction and increments the running total', async () => {
      prisma.loyaltyTransaction.create.mockResolvedValue({});
      prisma.loyaltyAccount.update.mockResolvedValue(rawAccount);

      await repo.earn(
        {
          loyaltyAccountId: 'la-1',
          orderId: 'o-1',
          points: 2,
          description: 'Points earned for order o-1',
        },
        prisma,
      );

      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          loyaltyAccountId: 'la-1',
          orderId: 'o-1',
          type: LoyaltyTransactionType.EARN,
          points: 2,
          description: 'Points earned for order o-1',
        }),
      });
      expect(prisma.loyaltyAccount.update).toHaveBeenCalledWith({
        where: { id: 'la-1' },
        data: { totalPoints: { increment: 2 } },
      });
    });

    it('stamps the EARN lot with a 12-month expiry', async () => {
      prisma.loyaltyTransaction.create.mockResolvedValue({});
      prisma.loyaltyAccount.update.mockResolvedValue(rawAccount);
      const before = new Date();

      await repo.earn(
        { loyaltyAccountId: 'la-1', orderId: 'o-1', points: 2, description: 'x' },
        prisma,
      );

      const data = prisma.loyaltyTransaction.create.mock.calls[0][0] as {
        data: { expiresAt: Date };
      };
      const elevenMonths = new Date(before);
      elevenMonths.setMonth(elevenMonths.getMonth() + 11);
      const thirteenMonths = new Date(before);
      thirteenMonths.setMonth(thirteenMonths.getMonth() + 13);
      expect(data.data.expiresAt.getTime()).toBeGreaterThan(elevenMonths.getTime());
      expect(data.data.expiresAt.getTime()).toBeLessThan(thirteenMonths.getTime());
    });
  });

  describe('redeem', () => {
    const input = {
      loyaltyAccountId: 'la-1',
      orderId: 'o-1',
      points: 5,
      description: 'Points redeemed for order o-1',
    };

    it('records the REDEEM transaction and decrements with the optimistic balance guard', async () => {
      prisma.loyaltyTransaction.create.mockResolvedValue({});
      prisma.loyaltyAccount.updateMany.mockResolvedValue({ count: 1 });

      await repo.redeem(input, prisma);

      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith({
        data: {
          loyaltyAccountId: 'la-1',
          orderId: 'o-1',
          type: LoyaltyTransactionType.REDEEM,
          points: 5,
          description: 'Points redeemed for order o-1',
        },
      });
      expect(prisma.loyaltyAccount.updateMany).toHaveBeenCalledWith({
        where: { id: 'la-1', totalPoints: { gte: 5 } },
        data: { totalPoints: { decrement: 5 } },
      });
    });

    it('throws CONFLICT when the conditional decrement matches no row (concurrent debit)', async () => {
      prisma.loyaltyTransaction.create.mockResolvedValue({});
      prisma.loyaltyAccount.updateMany.mockResolvedValue({ count: 0 });

      await expect(repo.redeem(input, prisma)).rejects.toBeInstanceOf(
        PointsRedemptionConflictError,
      );
    });

    it('maps a duplicate REDEEM per order (P2002) to CONFLICT and never decrements', async () => {
      prisma.loyaltyTransaction.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '7' }),
      );

      await expect(repo.redeem(input, prisma)).rejects.toBeInstanceOf(
        PointsRedemptionConflictError,
      );
      expect(prisma.loyaltyAccount.updateMany).not.toHaveBeenCalled();
    });

    it('rethrows any other persistence failure on the insert', async () => {
      const boom = new Error('db down');
      prisma.loyaltyTransaction.create.mockRejectedValue(boom);

      await expect(repo.redeem(input, prisma)).rejects.toBe(boom);
    });
  });

  describe('findAccountIdsWithExpirablePoints', () => {
    it('selects accounts with a positive balance and an EARN lot already past expiry', async () => {
      prisma.loyaltyAccount.findMany.mockResolvedValue([{ id: 'la-1' }, { id: 'la-2' }]);
      const now = new Date('2026-06-29T00:00:00.000Z');

      const ids = await repo.findAccountIdsWithExpirablePoints(now);

      expect(prisma.loyaltyAccount.findMany).toHaveBeenCalledWith({
        where: {
          totalPoints: { gt: 0 },
          loyaltyTransactions: {
            some: { type: LoyaltyTransactionType.EARN, expiresAt: { lt: now } },
          },
        },
        select: { id: true },
      });
      expect(ids).toEqual(['la-1', 'la-2']);
    });
  });

  describe('findLedger', () => {
    it('returns the account ledger chronologically mapped to plain entries', async () => {
      const earnedAt = new Date('2025-06-01T00:00:00.000Z');
      const expiresAt = new Date('2026-06-01T00:00:00.000Z');
      prisma.loyaltyTransaction.findMany.mockResolvedValue([
        { type: 'EARN', points: 5, createdAt: earnedAt, expiresAt },
      ]);

      const ledger = await repo.findLedger('la-1', prisma);

      expect(prisma.loyaltyTransaction.findMany).toHaveBeenCalledWith({
        where: { loyaltyAccountId: 'la-1' },
        orderBy: { createdAt: 'asc' },
        select: { type: true, points: true, createdAt: true, expiresAt: true },
      });
      expect(ledger).toEqual([
        { type: LoyaltyTransactionType.EARN, points: 5, createdAt: earnedAt, expiresAt },
      ]);
    });
  });

  describe('adjust', () => {
    it('records a positive ADJUSTMENT (refund) and increments the balance', async () => {
      prisma.loyaltyTransaction.create.mockResolvedValue({});
      prisma.loyaltyAccount.update.mockResolvedValue(rawAccount);

      await repo.adjust({ loyaltyAccountId: 'la-1', points: 5, description: 'refund' }, prisma);

      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith({
        data: {
          loyaltyAccountId: 'la-1',
          orderId: null,
          type: LoyaltyTransactionType.ADJUSTMENT,
          points: 5,
          description: 'refund',
          expiresAt: null,
        },
      });
      expect(prisma.loyaltyAccount.update).toHaveBeenCalledWith({
        where: { id: 'la-1' },
        data: { totalPoints: { increment: 5 } },
      });
    });

    it('records a negative ADJUSTMENT (clawback) and decrements via a negative increment', async () => {
      prisma.loyaltyTransaction.create.mockResolvedValue({});
      prisma.loyaltyAccount.update.mockResolvedValue(rawAccount);

      await repo.adjust({ loyaltyAccountId: 'la-1', points: -3, description: 'clawback' }, prisma);

      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: LoyaltyTransactionType.ADJUSTMENT,
          points: -3,
          orderId: null,
        }),
      });
      expect(prisma.loyaltyAccount.update).toHaveBeenCalledWith({
        where: { id: 'la-1' },
        data: { totalPoints: { increment: -3 } },
      });
    });
  });

  describe('expire', () => {
    const input = { loyaltyAccountId: 'la-1', points: 4, description: 'expired' };

    it('decrements under the balance guard then records the EXPIRE movement', async () => {
      prisma.loyaltyAccount.updateMany.mockResolvedValue({ count: 1 });
      prisma.loyaltyTransaction.create.mockResolvedValue({});

      const applied = await repo.expire(input, prisma);

      expect(prisma.loyaltyAccount.updateMany).toHaveBeenCalledWith({
        where: { id: 'la-1', totalPoints: { gte: 4 } },
        data: { totalPoints: { decrement: 4 } },
      });
      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith({
        data: {
          loyaltyAccountId: 'la-1',
          orderId: null,
          type: LoyaltyTransactionType.EXPIRE,
          points: 4,
          description: 'expired',
          expiresAt: null,
        },
      });
      expect(applied).toBe(true);
    });

    it('writes nothing and returns false when a concurrent debit drained the balance', async () => {
      prisma.loyaltyAccount.updateMany.mockResolvedValue({ count: 0 });

      const applied = await repo.expire(input, prisma);

      expect(applied).toBe(false);
      expect(prisma.loyaltyTransaction.create).not.toHaveBeenCalled();
    });
  });
});
