import { beforeEach, describe, expect, it } from '@jest/globals';
import { PrismaAuditLogRepository } from './prisma-audit-log.repository';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { AuditAction } from '@modules/audit/domain/audit-actions';
import { DelegateFn, argsOf, delegateFn } from '@shared/infrastructure/prisma/testing/prisma-mock';

type PrismaMock = {
  auditLog: {
    create: DelegateFn;
    findMany: DelegateFn;
  };
};

const buildPrismaMock = (): PrismaMock => ({
  auditLog: {
    create: delegateFn(),
    findMany: delegateFn(),
  },
});

const rawLog = {
  id: 'al-1',
  userId: 'u-1',
  action: 'USER_CREATED',
  entity: 'User',
  entityId: 'u-2',
  metadata: { username: 'joao' },
  createdAt: new Date('2026-03-01T00:00:00Z'),
};

const FROM = new Date('2026-01-01T00:00:00Z');
const TO = new Date('2026-02-01T00:00:00Z');

describe('PrismaAuditLogRepository', () => {
  let prisma: PrismaMock;
  let repo: PrismaAuditLogRepository;

  beforeEach(() => {
    prisma = buildPrismaMock();
    repo = new PrismaAuditLogRepository(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('writes the record fields through', async () => {
      prisma.auditLog.create.mockResolvedValue(rawLog);

      await repo.create({
        userId: 'u-1',
        action: 'USER_CREATED' as AuditAction,
        entity: 'User',
        entityId: 'u-2',
        metadata: { username: 'joao' },
      });

      expect(argsOf(prisma.auditLog.create).data).toStrictEqual({
        userId: 'u-1',
        action: 'USER_CREATED',
        entity: 'User',
        entityId: 'u-2',
        metadata: { username: 'joao' },
      });
    });

    // Prisma treats undefined as "leave the column alone" and null as "write JSON null".
    // Absent metadata must stay undefined, never be coerced.
    it('passes metadata through as undefined when it was not supplied', async () => {
      prisma.auditLog.create.mockResolvedValue(rawLog);

      await repo.create({
        userId: null,
        action: 'LOGIN_FAILED' as AuditAction,
        entity: 'User',
        entityId: null,
      });

      const data = argsOf(prisma.auditLog.create).data;
      expect(data?.metadata).toBeUndefined();
      expect(data?.userId).toBeNull();
      expect(data?.entityId).toBeNull();
    });

    it('accepts an anonymous actor (null userId)', async () => {
      prisma.auditLog.create.mockResolvedValue(rawLog);

      await expect(
        repo.create({
          userId: null,
          action: 'LOGIN_FAILED' as AuditAction,
          entity: 'User',
          entityId: null,
          metadata: {},
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('findMany', () => {
    beforeEach(() => {
      prisma.auditLog.findMany.mockResolvedValue([rawLog]);
    });

    it('maps rows to entities', async () => {
      const logs = await repo.findMany({ take: 20 });

      expect(logs).toHaveLength(1);
      expect(logs[0].id).toBe('al-1');
      expect(logs[0].action).toBe('USER_CREATED');
      expect(logs[0].metadata).toEqual({ username: 'joao' });
    });

    it('builds an empty where clause when no filters are given', async () => {
      await repo.findMany({ take: 20 });

      expect(argsOf(prisma.auditLog.findMany).where).toStrictEqual({});
    });

    it('builds an open-ended lower bound from `from` alone', async () => {
      await repo.findMany({ filters: { from: FROM }, take: 20 });

      expect(argsOf(prisma.auditLog.findMany).where).toStrictEqual({ createdAt: { gte: FROM } });
    });

    it('builds an open-ended upper bound from `to` alone', async () => {
      await repo.findMany({ filters: { to: TO }, take: 20 });

      expect(argsOf(prisma.auditLog.findMany).where).toStrictEqual({ createdAt: { lte: TO } });
    });

    it('builds a closed range when both bounds are given', async () => {
      await repo.findMany({ filters: { from: FROM, to: TO }, take: 20 });

      expect(argsOf(prisma.auditLog.findMany).where).toStrictEqual({
        createdAt: { gte: FROM, lte: TO },
      });
    });

    it('AND-combines the scalar filters', async () => {
      await repo.findMany({
        filters: { userId: 'u-1', action: 'USER_CREATED', entity: 'User', entityId: 'u-2' },
        take: 20,
      });

      expect(argsOf(prisma.auditLog.findMany).where).toStrictEqual({
        userId: 'u-1',
        action: 'USER_CREATED',
        entity: 'User',
        entityId: 'u-2',
      });
    });

    it('orders by a stable (createdAt, id) key so the cursor cannot skip rows', async () => {
      await repo.findMany({ take: 20 });

      expect(argsOf(prisma.auditLog.findMany).orderBy).toEqual([
        { createdAt: 'desc' },
        { id: 'desc' },
      ]);
    });

    it('pages by comparing the sort key, never by a positional cursor', async () => {
      const keysetAt = new Date('2026-01-01T00:00:00Z');

      await repo.findMany({ take: 20, keyset: { timestamp: keysetAt, id: 'al-0' } });

      const args = argsOf(prisma.auditLog.findMany) as { where?: Record<string, unknown> };
      expect(args.where).toMatchObject({
        AND: [
          {
            OR: [{ createdAt: { lt: keysetAt } }, { createdAt: keysetAt, id: { lt: 'al-0' } }],
          },
        ],
      });
      expect(args).toMatchObject({ take: 20 });
      expect(args).not.toHaveProperty('cursor');
      expect(args).not.toHaveProperty('skip');
    });

    it('keeps the window filter alongside the keyset instead of replacing it', async () => {
      const keysetAt = new Date('2026-01-01T00:00:00Z');

      await repo.findMany({
        take: 20,
        keyset: { timestamp: keysetAt, id: 'al-0' },
        filters: { userId: 'u-1' },
      });

      const args = argsOf(prisma.auditLog.findMany) as { where?: Record<string, unknown> };
      expect(args.where).toMatchObject({ userId: 'u-1' });
    });

    it('omits cursor and skip on the first page', async () => {
      await repo.findMany({ take: 20 });

      const args = argsOf(prisma.auditLog.findMany);
      expect(args).not.toHaveProperty('cursor');
      expect(args).not.toHaveProperty('skip');
    });

    it('maps a null metadata column to null', async () => {
      prisma.auditLog.findMany.mockResolvedValue([{ ...rawLog, metadata: null }]);

      const logs = await repo.findMany({ take: 20 });

      expect(logs[0].metadata).toBeNull();
    });
  });
});
