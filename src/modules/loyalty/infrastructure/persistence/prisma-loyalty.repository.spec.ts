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
    create: DelegateFn;
    update: DelegateFn;
    updateMany: DelegateFn;
  };
  loyaltyTransaction: {
    create: DelegateFn;
  };
};

const delegateFn = (): DelegateFn => jest.fn() as DelegateFn;

const buildPrismaMock = (): PrismaMock => ({
  loyaltyAccount: {
    findUnique: delegateFn(),
    create: delegateFn(),
    update: delegateFn(),
    updateMany: delegateFn(),
  },
  loyaltyTransaction: {
    create: delegateFn(),
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
        data: {
          loyaltyAccountId: 'la-1',
          orderId: 'o-1',
          type: LoyaltyTransactionType.EARN,
          points: 2,
          description: 'Points earned for order o-1',
        },
      });
      expect(prisma.loyaltyAccount.update).toHaveBeenCalledWith({
        where: { id: 'la-1' },
        data: { totalPoints: { increment: 2 } },
      });
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
});
