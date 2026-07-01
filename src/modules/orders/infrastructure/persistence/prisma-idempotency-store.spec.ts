import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { PrismaIdempotencyStore } from './prisma-idempotency-store';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { IdempotencyRaceError } from '@modules/orders/application/errors/idempotency-race.error';

type DelegateFn = jest.MockedFunction<(args?: unknown) => Promise<unknown>>;

type PrismaMock = {
  idempotencyKey: {
    findFirst: DelegateFn;
    create: DelegateFn;
    deleteMany: DelegateFn;
  };
};

const delegateFn = (): DelegateFn => jest.fn() as DelegateFn;

const buildPrismaMock = (): PrismaMock => ({
  idempotencyKey: {
    findFirst: delegateFn(),
    create: delegateFn(),
    deleteMany: delegateFn(),
  },
});

const recordInput = {
  key: 'idem-1',
  userId: 'u-1',
  endpoint: 'POST /orders',
  requestHash: 'hash-1',
  orderId: 'o-1',
  expiresAt: new Date('2026-07-01T00:00:00.000Z'),
};

describe('PrismaIdempotencyStore', () => {
  let prisma: PrismaMock;
  let store: PrismaIdempotencyStore;

  beforeEach(() => {
    prisma = buildPrismaMock();
    store = new PrismaIdempotencyStore(prisma as unknown as PrismaService);
  });

  describe('find', () => {
    it('looks up by (userId, endpoint, key) guarded on a future expiresAt and maps the row', async () => {
      prisma.idempotencyKey.findFirst.mockResolvedValue({
        requestHash: 'hash-1',
        orderId: 'o-1',
      });

      const result = await store.find({ key: 'idem-1', userId: 'u-1', endpoint: 'POST /orders' });

      expect(prisma.idempotencyKey.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'u-1',
          endpoint: 'POST /orders',
          key: 'idem-1',
          // The guard is what makes an expired-but-unreaped key behave as absent.
          expiresAt: { gt: expect.any(Date) },
        },
      });
      expect(result).toEqual({ requestHash: 'hash-1', orderId: 'o-1' });
    });

    it('returns null when no live row exists (absent or past its TTL)', async () => {
      prisma.idempotencyKey.findFirst.mockResolvedValue(null);

      const result = await store.find({ key: 'x', userId: 'u-1', endpoint: 'POST /orders' });

      expect(result).toBeNull();
    });
  });

  describe('record', () => {
    it('clears any expired row for the key, then creates the row on the supplied tx client', async () => {
      prisma.idempotencyKey.deleteMany.mockResolvedValue({ count: 0 });
      prisma.idempotencyKey.create.mockResolvedValue({});

      await store.record(recordInput, prisma);

      // The stale-row cleanup must scope to this key and only delete already-expired rows,
      // so a still-live duplicate survives to trip the unique constraint (the race case).
      expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'u-1',
          endpoint: 'POST /orders',
          key: 'idem-1',
          expiresAt: { lt: expect.any(Date) },
        },
      });
      expect(prisma.idempotencyKey.create).toHaveBeenCalledWith({
        data: {
          key: 'idem-1',
          userId: 'u-1',
          endpoint: 'POST /orders',
          requestHash: 'hash-1',
          orderId: 'o-1',
          expiresAt: recordInput.expiresAt,
        },
      });
    });

    it('translates a unique-constraint violation (P2002) into IdempotencyRaceError', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.idempotencyKey.create.mockRejectedValue(p2002);

      await expect(store.record(recordInput, prisma)).rejects.toBeInstanceOf(IdempotencyRaceError);
      await expect(store.record(recordInput, prisma)).rejects.toMatchObject({ cause: p2002 });
    });

    it('rethrows any non-P2002 error untouched', async () => {
      const boom = new Error('connection lost');
      prisma.idempotencyKey.create.mockRejectedValue(boom);

      await expect(store.record(recordInput, prisma)).rejects.toBe(boom);
    });
  });

  describe('deleteExpired', () => {
    it('deletes rows past their TTL and returns the count', async () => {
      prisma.idempotencyKey.deleteMany.mockResolvedValue({ count: 3 });
      const now = new Date('2026-06-29T12:00:00.000Z');

      const removed = await store.deleteExpired(now);

      expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: now } },
      });
      expect(removed).toBe(3);
    });
  });
});
