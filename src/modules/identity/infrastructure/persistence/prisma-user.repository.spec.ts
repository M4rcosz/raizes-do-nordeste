import { beforeEach, describe, expect, it } from '@jest/globals';
import { PrismaUserRepository } from './prisma-user.repository';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { UserAlreadyExistsError } from '@modules/identity/application/errors/user-already-exists.error';
import { InvalidBusinessUnitError } from '@modules/identity/application/errors/invalid-business-unit.error';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { CreateUserInput } from '@modules/identity/domain/repositories/user.repository';
import {
  DelegateFn,
  argsOf,
  delegateFn,
  knownRequestError,
} from '@shared/infrastructure/prisma/testing/prisma-mock';

type PrismaMock = {
  user: {
    findUnique: DelegateFn;
    findMany: DelegateFn;
    create: DelegateFn;
    update: DelegateFn;
    updateMany: DelegateFn;
  };
  userBusinessUnit: {
    deleteMany: DelegateFn;
    createMany: DelegateFn;
  };
};

const buildPrismaMock = (): PrismaMock => ({
  user: {
    findUnique: delegateFn(),
    findMany: delegateFn(),
    create: delegateFn(),
    update: delegateFn(),
    updateMany: delegateFn(),
  },
  userBusinessUnit: {
    deleteMany: delegateFn(),
    createMany: delegateFn(),
  },
});

const rawUser = {
  id: 'u-1',
  username: 'joao.atendente',
  name: 'Joao Atendente',
  email: 'joao@example.com',
  passwordHash: 'argon2-hash',
  phone: '+5581988888888',
  role: UserRole.ATTENDANT,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  updatedById: null,
  businessUnits: [{ businessUnitId: 'bu-1' }, { businessUnitId: 'bu-2' }],
};

const createInput: CreateUserInput = {
  id: 'u-1',
  businessUnitIds: ['bu-1', 'bu-2'],
  username: 'joao.atendente',
  name: 'Joao Atendente',
  email: 'joao@example.com',
  passwordHash: 'argon2-hash',
  phone: '+5581988888888',
  role: UserRole.ATTENDANT,
  isActive: true,
  createdAt: rawUser.createdAt,
  updatedAt: rawUser.updatedAt,
};

// The delegates take `unknown`; reading back what the repo passed needs a shape.
describe('PrismaUserRepository', () => {
  let prisma: PrismaMock;
  let repo: PrismaUserRepository;

  beforeEach(() => {
    prisma = buildPrismaMock();
    repo = new PrismaUserRepository(prisma as unknown as PrismaService);
  });

  describe('findById / findByUsername', () => {
    it('returns null when no row matches', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(repo.findById('missing')).resolves.toBeNull();
      await expect(repo.findByUsername('missing')).resolves.toBeNull();
    });

    it('maps the row to an entity, flattening the unit links', async () => {
      prisma.user.findUnique.mockResolvedValue(rawUser);

      const user = await repo.findById('u-1');

      expect(user?.id).toBe('u-1');
      expect(user?.businessUnitIds).toEqual(['bu-1', 'bu-2']);
      expect(user?.role).toBe(UserRole.ATTENDANT);
      expect(user?.isActive).toBe(true);
    });

    it('always loads the unit links, otherwise businessUnitIds would be undefined', async () => {
      prisma.user.findUnique.mockResolvedValue(rawUser);
      await repo.findById('u-1');

      expect(argsOf(prisma.user.findUnique)).toMatchObject({
        include: { businessUnits: { select: { businessUnitId: true } } },
      });
    });
  });

  describe('create', () => {
    it('writes the unit links alongside the user', async () => {
      prisma.user.create.mockResolvedValue(rawUser);

      const user = await repo.create(createInput);

      expect(argsOf(prisma.user.create).data).toMatchObject({
        id: 'u-1',
        username: 'joao.atendente',
        businessUnits: { create: [{ businessUnitId: 'bu-1' }, { businessUnitId: 'bu-2' }] },
      });
      expect(user.businessUnitIds).toEqual(['bu-1', 'bu-2']);
    });

    // Collisions are translated, not pre-checked with an exists query, which would race.
    it('translates P2002 into a CONFLICT and chains the cause', async () => {
      const p2002 = knownRequestError('P2002');
      prisma.user.create.mockRejectedValue(p2002);

      await expect(repo.create(createInput)).rejects.toBeInstanceOf(UserAlreadyExistsError);
      await expect(repo.create(createInput)).rejects.toMatchObject({ cause: p2002 });
    });

    it('translates P2003 (unknown business unit FK) into InvalidBusinessUnitError', async () => {
      const p2003 = knownRequestError('P2003');
      prisma.user.create.mockRejectedValue(p2003);

      await expect(repo.create(createInput)).rejects.toBeInstanceOf(InvalidBusinessUnitError);
      await expect(repo.create(createInput)).rejects.toMatchObject({ cause: p2003 });
    });

    it('rethrows an unrecognised Prisma error untouched', async () => {
      const p1001 = knownRequestError('P1001');
      prisma.user.create.mockRejectedValue(p1001);

      await expect(repo.create(createInput)).rejects.toBe(p1001);
    });

    it('rethrows a non-Prisma error untouched', async () => {
      const boom = new Error('connection reset');
      prisma.user.create.mockRejectedValue(boom);

      await expect(repo.create(createInput)).rejects.toBe(boom);
    });
  });

  // The guard on (id, role, isActive) is what closes the read-then-authorize window:
  // the role the use case authorized against must still be the role the row holds.
  describe('deactivateIfRole', () => {
    it('guards the write on the expected role and the current active state', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue({ ...rawUser, isActive: false });

      await repo.deactivateIfRole('u-1', UserRole.ATTENDANT, 'admin-1');

      const args = argsOf(prisma.user.updateMany);
      expect(args.where).toStrictEqual({
        id: 'u-1',
        role: UserRole.ATTENDANT,
        isActive: true,
      });
      expect(args.data).toStrictEqual({ isActive: false, updatedById: 'admin-1' });
    });

    it('returns null and skips the re-read when the guard matched no row', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(repo.deactivateIfRole('u-1', UserRole.ATTENDANT, 'admin-1')).resolves.toBeNull();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('re-reads and returns the persisted snapshot when the row flipped', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue({ ...rawUser, isActive: false });

      const user = await repo.deactivateIfRole('u-1', UserRole.ATTENDANT, 'admin-1');

      expect(user?.isActive).toBe(false);
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('reactivateIfRole', () => {
    it('guards on isActive:false, the mirror of deactivate', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue(rawUser);

      await repo.reactivateIfRole('u-1', UserRole.ATTENDANT, 'admin-1');

      const args = argsOf(prisma.user.updateMany);
      expect(args.where).toStrictEqual({
        id: 'u-1',
        role: UserRole.ATTENDANT,
        isActive: false,
      });
      expect(args.data).toStrictEqual({ isActive: true, updatedById: 'admin-1' });
    });

    it('returns null and skips the re-read when the guard matched no row', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(repo.reactivateIfRole('u-1', UserRole.ATTENDANT, 'admin-1')).resolves.toBeNull();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('accepts a null actor id (system-initiated reactivation)', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue(rawUser);

      await repo.reactivateIfRole('u-1', UserRole.ATTENDANT, null);

      expect(argsOf(prisma.user.updateMany).data).toStrictEqual({
        isActive: true,
        updatedById: null,
      });
    });
  });

  describe('updateProfile', () => {
    it('sends only the fields that were supplied', async () => {
      prisma.user.update.mockResolvedValue(rawUser);

      await repo.updateProfile('u-1', { name: 'Novo Nome' }, 'admin-1');

      expect(argsOf(prisma.user.update).data).toStrictEqual({
        name: 'Novo Nome',
        updatedById: 'admin-1',
      });
    });

    it('stamps updatedById even when no profile field changed', async () => {
      prisma.user.update.mockResolvedValue(rawUser);

      await repo.updateProfile('u-1', {}, 'admin-1');

      expect(argsOf(prisma.user.update).data).toStrictEqual({ updatedById: 'admin-1' });
    });

    // P2025 means the row vanished between read and write. That is a not-found for
    // the caller, not a server error, so it must not surface as a throw.
    it('returns null on P2025 rather than throwing', async () => {
      prisma.user.update.mockRejectedValue(knownRequestError('P2025'));

      await expect(repo.updateProfile('u-1', { name: 'x' }, 'admin-1')).resolves.toBeNull();
    });

    it('translates a phone collision (P2002) into a CONFLICT', async () => {
      prisma.user.update.mockRejectedValue(knownRequestError('P2002'));

      await expect(repo.updateProfile('u-1', { phone: '+55' }, 'admin-1')).rejects.toBeInstanceOf(
        UserAlreadyExistsError,
      );
    });

    it('rethrows any other error untouched', async () => {
      const boom = new Error('deadlock');
      prisma.user.update.mockRejectedValue(boom);

      await expect(repo.updateProfile('u-1', { name: 'x' }, 'admin-1')).rejects.toBe(boom);
    });
  });

  describe('updatePasswordHash', () => {
    it('writes through the base connection when no transaction is threaded', async () => {
      prisma.user.update.mockResolvedValue(rawUser);

      await repo.updatePasswordHash('u-1', 'new-hash', 'u-1');

      expect(argsOf(prisma.user.update).data).toStrictEqual({
        passwordHash: 'new-hash',
        updatedById: 'u-1',
      });
    });

    // Password rotation and session revocation must land in the same unit of work.
    it('writes through the transaction client when one is threaded', async () => {
      const tx = buildPrismaMock();
      tx.user.update.mockResolvedValue(rawUser);

      await repo.updatePasswordHash('u-1', 'new-hash', 'u-1', tx);

      expect(tx.user.update).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('returns null on P2025 rather than throwing', async () => {
      prisma.user.update.mockRejectedValue(knownRequestError('P2025'));

      await expect(repo.updatePasswordHash('u-1', 'new-hash', 'u-1')).resolves.toBeNull();
    });

    it('rethrows any other error untouched', async () => {
      const boom = new Error('deadlock');
      prisma.user.update.mockRejectedValue(boom);

      await expect(repo.updatePasswordHash('u-1', 'new-hash', 'u-1')).rejects.toBe(boom);
    });
  });

  describe('findMany filters', () => {
    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([rawUser]);
    });

    it('builds an empty where clause when no filters are given', async () => {
      await repo.findMany({ pagination: { take: 20 } });

      expect(argsOf(prisma.user.findMany).where).toStrictEqual({});
    });

    // The critical one. An empty scope means "this actor sees nobody". Dropping the
    // filter here would be fail-open: a caller that forgot to short-circuit an empty
    // scope would list every user in the system.
    it('keeps an empty businessUnitIds scope as a filter that matches nobody', async () => {
      await repo.findMany({ filters: { businessUnitIds: [] }, pagination: { take: 20 } });

      expect(argsOf(prisma.user.findMany).where).toStrictEqual({
        businessUnits: { some: { businessUnitId: { in: [] } } },
      });
    });

    it('omits the unit filter entirely when businessUnitIds is undefined', async () => {
      await repo.findMany({ filters: { username: 'joao' }, pagination: { take: 20 } });

      expect(argsOf(prisma.user.findMany).where).not.toHaveProperty('businessUnits');
    });

    it('matches users linked to any of the given units', async () => {
      await repo.findMany({ filters: { businessUnitIds: ['bu-1'] }, pagination: { take: 20 } });

      expect(argsOf(prisma.user.findMany).where).toStrictEqual({
        businessUnits: { some: { businessUnitId: { in: ['bu-1'] } } },
      });
    });

    it('matches username and email case-insensitively, AND-combined', async () => {
      await repo.findMany({
        filters: { username: 'joao', email: 'EXAMPLE' },
        pagination: { take: 20 },
      });

      expect(argsOf(prisma.user.findMany).where).toStrictEqual({
        username: { contains: 'joao', mode: 'insensitive' },
        email: { contains: 'EXAMPLE', mode: 'insensitive' },
      });
    });

    it('orders by a stable (createdAt, id) key so the cursor cannot skip rows', async () => {
      await repo.findMany({ pagination: { take: 20 } });

      expect(argsOf(prisma.user.findMany).orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });

    it('skips the cursor row itself when paging forward', async () => {
      await repo.findMany({ pagination: { take: 20, cursor: 'u-0' } });

      expect(argsOf(prisma.user.findMany)).toMatchObject({
        take: 20,
        cursor: { id: 'u-0' },
        skip: 1,
      });
    });

    it('omits cursor and skip on the first page', async () => {
      await repo.findMany({ pagination: { take: 20 } });

      const args = argsOf(prisma.user.findMany);
      expect(args).not.toHaveProperty('cursor');
      expect(args).not.toHaveProperty('skip');
    });
  });

  describe('replaceBusinessUnits', () => {
    let tx: PrismaMock;

    beforeEach(() => {
      tx = buildPrismaMock();
    });

    // The existence check lives inside the tx so a vanished user reports not-found
    // instead of silently leaving orphan link rows behind.
    it('returns null without touching the links when the user is gone', async () => {
      tx.user.findUnique.mockResolvedValue(null);

      const result = await repo.replaceBusinessUnits('u-1', ['bu-9'], 'admin-1', tx);

      expect(result).toBeNull();
      expect(tx.userBusinessUnit.deleteMany).not.toHaveBeenCalled();
      expect(tx.userBusinessUnit.createMany).not.toHaveBeenCalled();
    });

    it('swaps the links and stamps updatedById, all on the transaction client', async () => {
      tx.user.findUnique.mockResolvedValue({ id: 'u-1' });
      tx.userBusinessUnit.deleteMany.mockResolvedValue({ count: 2 });
      tx.userBusinessUnit.createMany.mockResolvedValue({ count: 1 });
      tx.user.update.mockResolvedValue({ ...rawUser, businessUnits: [{ businessUnitId: 'bu-9' }] });

      const user = await repo.replaceBusinessUnits('u-1', ['bu-9'], 'admin-1', tx);

      expect(argsOf(tx.userBusinessUnit.deleteMany).where).toStrictEqual({ userId: 'u-1' });
      expect(argsOf(tx.userBusinessUnit.createMany).data).toStrictEqual([
        { userId: 'u-1', businessUnitId: 'bu-9' },
      ]);
      expect(argsOf(tx.user.update).data).toStrictEqual({ updatedById: 'admin-1' });
      expect(user?.businessUnitIds).toEqual(['bu-9']);

      // Nothing may leak onto the base connection, or the swap would not be atomic.
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.userBusinessUnit.deleteMany).not.toHaveBeenCalled();
    });

    it('clears every link when handed an empty scope', async () => {
      tx.user.findUnique.mockResolvedValue({ id: 'u-1' });
      tx.userBusinessUnit.deleteMany.mockResolvedValue({ count: 2 });
      tx.userBusinessUnit.createMany.mockResolvedValue({ count: 0 });
      tx.user.update.mockResolvedValue({ ...rawUser, businessUnits: [] });

      const user = await repo.replaceBusinessUnits('u-1', [], 'admin-1', tx);

      expect(argsOf(tx.userBusinessUnit.createMany).data).toStrictEqual([]);
      expect(user?.businessUnitIds).toEqual([]);
    });

    it('translates an unknown unit FK violation (P2003) into InvalidBusinessUnitError', async () => {
      tx.user.findUnique.mockResolvedValue({ id: 'u-1' });
      tx.userBusinessUnit.deleteMany.mockResolvedValue({ count: 0 });
      tx.userBusinessUnit.createMany.mockRejectedValue(knownRequestError('P2003'));

      await expect(
        repo.replaceBusinessUnits('u-1', ['ghost'], 'admin-1', tx),
      ).rejects.toBeInstanceOf(InvalidBusinessUnitError);
    });

    it('rethrows any other error untouched', async () => {
      const boom = new Error('serialization failure');
      tx.user.findUnique.mockResolvedValue({ id: 'u-1' });
      tx.userBusinessUnit.deleteMany.mockRejectedValue(boom);

      await expect(repo.replaceBusinessUnits('u-1', ['bu-9'], 'admin-1', tx)).rejects.toBe(boom);
    });
  });
});
