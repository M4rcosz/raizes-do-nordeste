import { beforeEach, describe, expect, it } from '@jest/globals';
import { PrismaRefreshTokenRepository } from './prisma-refresh-token.repository';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { RefreshToken } from '@modules/identity/domain/entities/refresh-token.entity';
import {
  DelegateFn,
  PrismaArgs,
  argsOf,
  delegateFn,
} from '@shared/infrastructure/prisma/testing/prisma-mock';

type PrismaMock = {
  refreshToken: {
    findUnique: DelegateFn;
    create: DelegateFn;
    update: DelegateFn;
    updateMany: DelegateFn;
  };
};

const buildPrismaMock = (): PrismaMock => ({
  refreshToken: {
    findUnique: delegateFn(),
    create: delegateFn(),
    update: delegateFn(),
    updateMany: delegateFn(),
  },
});

const rawToken = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'rt-1',
  userId: 'u-1',
  tokenHash: 'hash-1',
  expiresAt: new Date('2026-12-31T00:00:00Z'),
  revokedAt: null,
  replacedById: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('PrismaRefreshTokenRepository', () => {
  let prisma: PrismaMock;
  let repo: PrismaRefreshTokenRepository;

  beforeEach(() => {
    prisma = buildPrismaMock();
    repo = new PrismaRefreshTokenRepository(prisma as unknown as PrismaService);
  });

  describe('findByTokenHash', () => {
    it('returns null when the hash matches nothing', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(repo.findByTokenHash('nope')).resolves.toBeNull();
    });

    it('looks the token up by hash, never by plaintext', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(rawToken());

      const token = await repo.findByTokenHash('hash-1');

      expect(argsOf(prisma.refreshToken.findUnique).where).toStrictEqual({ tokenHash: 'hash-1' });
      expect(token?.id).toBe('rt-1');
      expect(token?.tokenHash).toBe('hash-1');
    });
  });

  describe('save', () => {
    it('persists the entity fields as-is', async () => {
      prisma.refreshToken.create.mockResolvedValue(rawToken());
      const token = RefreshToken.issue({ userId: 'u-1', tokenHash: 'hash-1', ttlMs: 60_000 });

      await repo.save(token);

      expect(argsOf(prisma.refreshToken.create).data).toStrictEqual({
        id: token.id,
        tokenHash: 'hash-1',
        userId: 'u-1',
        expiresAt: token.expiresAt,
        revokedAt: null,
        replacedById: null,
        createdAt: token.createdAt,
      });
    });

    it('writes through the transaction client when one is threaded', async () => {
      const tx = buildPrismaMock();
      tx.refreshToken.create.mockResolvedValue(rawToken());
      const token = RefreshToken.issue({ userId: 'u-1', tokenHash: 'hash-1', ttlMs: 60_000 });

      await repo.save(token, tx);

      expect(tx.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  // Rotation is single-use. The revokedAt IS NULL guard is what makes two concurrent
  // refreshes of the same token resolve to exactly one winner.
  describe('revoke', () => {
    it('guards the write on revokedAt being null', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await repo.revoke('rt-1', 'rt-2');

      const args = argsOf(prisma.refreshToken.updateMany);
      expect(args.where).toStrictEqual({ id: 'rt-1', revokedAt: null });
      expect(args.data).toMatchObject({ replacedById: 'rt-2' });
      expect(args.data?.revokedAt).toBeInstanceOf(Date);
    });

    it('returns 1 when this caller won the race', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(repo.revoke('rt-1', 'rt-2')).resolves.toBe(1);
    });

    it('returns 0 when the token was already revoked by a concurrent rotation', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(repo.revoke('rt-1', 'rt-2')).resolves.toBe(0);
    });

    it('accepts a null replacement (revocation that ends the chain)', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await repo.revoke('rt-1', null);

      expect(argsOf(prisma.refreshToken.updateMany).data).toMatchObject({ replacedById: null });
    });

    it('writes through the transaction client when one is threaded', async () => {
      const tx = buildPrismaMock();
      tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await repo.revoke('rt-1', 'rt-2', tx);

      expect(tx.refreshToken.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  // Reuse detection: presenting an already-rotated token must kill every live
  // descendant, not just the row presented.
  describe('revokeChainFrom', () => {
    it('walks replacedById forward and revokes each live descendant', async () => {
      prisma.refreshToken.findUnique
        .mockResolvedValueOnce(rawToken({ id: 'rt-1', replacedById: 'rt-2' }))
        .mockResolvedValueOnce(rawToken({ id: 'rt-2', replacedById: 'rt-3' }))
        .mockResolvedValueOnce(rawToken({ id: 'rt-3', replacedById: null }));
      prisma.refreshToken.update.mockResolvedValue(rawToken());

      await repo.revokeChainFrom('rt-1');

      expect(prisma.refreshToken.update).toHaveBeenCalledTimes(3);
      const revokedIds = prisma.refreshToken.update.mock.calls.map(
        (call) => (call[0] as PrismaArgs).where?.id,
      );
      expect(revokedIds).toEqual(['rt-1', 'rt-2', 'rt-3']);
    });

    it('does not re-revoke a row that is already revoked, but keeps walking past it', async () => {
      const revokedAt = new Date('2026-02-01T00:00:00Z');
      prisma.refreshToken.findUnique
        .mockResolvedValueOnce(rawToken({ id: 'rt-1', revokedAt, replacedById: 'rt-2' }))
        .mockResolvedValueOnce(rawToken({ id: 'rt-2', replacedById: null }));
      prisma.refreshToken.update.mockResolvedValue(rawToken());

      await repo.revokeChainFrom('rt-1');

      expect(prisma.refreshToken.update).toHaveBeenCalledTimes(1);
      expect(argsOf(prisma.refreshToken.update).where).toStrictEqual({ id: 'rt-2' });
    });

    it('stops when the chain points at a row that no longer exists', async () => {
      prisma.refreshToken.findUnique
        .mockResolvedValueOnce(rawToken({ id: 'rt-1', replacedById: 'rt-ghost' }))
        .mockResolvedValueOnce(null);
      prisma.refreshToken.update.mockResolvedValue(rawToken());

      await expect(repo.revokeChainFrom('rt-1')).resolves.toBeUndefined();
      expect(prisma.refreshToken.update).toHaveBeenCalledTimes(1);
    });

    it('stops immediately when the starting token does not exist', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await repo.revokeChainFrom('rt-ghost');

      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('handles a single-node chain', async () => {
      prisma.refreshToken.findUnique.mockResolvedValueOnce(
        rawToken({ id: 'rt-1', replacedById: null }),
      );
      prisma.refreshToken.update.mockResolvedValue(rawToken());

      await repo.revokeChainFrom('rt-1');

      expect(prisma.refreshToken.update).toHaveBeenCalledTimes(1);
    });

    it('walks the chain on the transaction client when one is threaded', async () => {
      const tx = buildPrismaMock();
      tx.refreshToken.findUnique.mockResolvedValueOnce(rawToken({ replacedById: null }));
      tx.refreshToken.update.mockResolvedValue(rawToken());

      await repo.revokeChainFrom('rt-1', tx);

      expect(tx.refreshToken.update).toHaveBeenCalledTimes(1);
      expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllActiveForUser', () => {
    it('kills every live token of the user in one guarded write', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      const count = await repo.revokeAllActiveForUser('u-1');

      const args = argsOf(prisma.refreshToken.updateMany);
      expect(args.where).toStrictEqual({ userId: 'u-1', revokedAt: null });
      expect(args.data?.revokedAt).toBeInstanceOf(Date);
      expect(count).toBe(3);
    });

    it('reports 0 when the user had no live tokens', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(repo.revokeAllActiveForUser('u-1')).resolves.toBe(0);
    });

    it('writes through the transaction client when one is threaded', async () => {
      const tx = buildPrismaMock();
      tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await repo.revokeAllActiveForUser('u-1', tx);

      expect(tx.refreshToken.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
