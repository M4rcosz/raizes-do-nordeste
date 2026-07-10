import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma, type BusinessUnit as PrismaBusinessUnit } from '@prisma/client';
import { PrismaBusinessUnitRepository } from './prisma-business-unit.repository';
import type { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import type { CreateBusinessUnitInput } from '../../domain/repositories/business-unit.repository';
import { BusinessUnit } from '../../domain/entities/business-unit.entity';
import { BusinessUnitAlreadyExistsError } from '../../domain/errors/business-unit-already-exists.error';
import { knownRequestError } from '@shared/infrastructure/prisma/testing/prisma-mock';

type BusinessUnitCreateFn = (args: unknown) => Promise<PrismaBusinessUnit>;
type BusinessUnitUpdateFn = (args: unknown) => Promise<PrismaBusinessUnit>;
type FindUniqueFn = (args: unknown) => Promise<PrismaBusinessUnit | null>;
type FindManyFn = (args: unknown) => Promise<PrismaBusinessUnit[]>;

const knownError = (code: string, target: string[]): Prisma.PrismaClientKnownRequestError =>
  knownRequestError(code, { target });

type Args = { where?: Record<string, unknown> } & Record<string, unknown>;

describe('PrismaBusinessUnitRepository', () => {
  let create: jest.MockedFunction<BusinessUnitCreateFn>;
  let update: jest.MockedFunction<BusinessUnitUpdateFn>;
  let findUnique: jest.MockedFunction<FindUniqueFn>;
  let findMany: jest.MockedFunction<FindManyFn>;
  let repo: PrismaBusinessUnitRepository;

  const input: CreateBusinessUnitInput = {
    name: 'Raízes Pelourinho',
    cnpj: '12345678000190',
    address: 'Largo do Pelourinho, 10',
    city: 'Salvador',
    phone: '7132223344',
  };

  const persistedRow: PrismaBusinessUnit = {
    id: 'uuid-1',
    name: 'Raízes Pelourinho',
    cnpj: '12345678000190',
    address: 'Largo do Pelourinho, 10',
    city: 'Salvador',
    phone: '7132223344',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };

  beforeEach(() => {
    create = jest.fn() as jest.MockedFunction<BusinessUnitCreateFn>;
    update = jest.fn() as jest.MockedFunction<BusinessUnitUpdateFn>;
    findUnique = jest.fn() as jest.MockedFunction<FindUniqueFn>;
    findMany = jest.fn() as jest.MockedFunction<FindManyFn>;
    const prisma = {
      businessUnit: { create, update, findUnique, findMany },
    } as unknown as PrismaService;
    repo = new PrismaBusinessUnitRepository(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('forwards the input fields and maps the persisted row to a domain BusinessUnit', async () => {
      create.mockResolvedValue(persistedRow);

      const unit = await repo.create(input);

      expect(create).toHaveBeenCalledWith({
        data: {
          name: input.name,
          cnpj: input.cnpj,
          address: input.address,
          city: input.city,
          phone: input.phone,
        },
      });
      expect(unit).toBeInstanceOf(BusinessUnit);
      expect(unit.id).toBe('uuid-1');
      expect(unit.cnpj).toBe('12345678000190');
      expect(unit.phone).toBe('7132223344');
      expect(unit.isActive).toBe(true);
    });

    it('translates a P2002 on cnpj into BusinessUnitAlreadyExistsError naming the cnpj', async () => {
      const prismaError = knownError('P2002', ['cnpj']);
      create.mockRejectedValue(prismaError);

      await expect(repo.create(input)).rejects.toBeInstanceOf(BusinessUnitAlreadyExistsError);
      await expect(repo.create(input)).rejects.toMatchObject({
        cause: prismaError,
        message: expect.stringContaining('cnpj') as unknown as string,
      });
    });

    it('translates a P2002 on phone into BusinessUnitAlreadyExistsError naming the phone', async () => {
      const prismaError = knownError('P2002', ['phone']);
      create.mockRejectedValue(prismaError);

      await expect(repo.create(input)).rejects.toMatchObject({
        message: expect.stringContaining('phone') as unknown as string,
      });
    });

    it('rethrows unmapped Prisma error codes unchanged', async () => {
      const prismaError = knownError('P2000', ['cnpj']);
      create.mockRejectedValue(prismaError);

      await expect(repo.create(input)).rejects.toBe(prismaError);
    });

    it('rethrows non-Prisma errors unchanged', async () => {
      const genericError = new Error('connection lost');
      create.mockRejectedValue(genericError);

      await expect(repo.create(input)).rejects.toBe(genericError);
    });
  });

  describe('update', () => {
    const domainUnit = new BusinessUnit(
      'uuid-1',
      'Raízes Rio Vermelho',
      '12345678000190',
      'Rua da Paciência, 20',
      'Salvador',
      '7133334455',
      true,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );

    it('persists only the editable fields and maps the row back to a domain BusinessUnit', async () => {
      update.mockResolvedValue({
        ...persistedRow,
        name: 'Raízes Rio Vermelho',
        address: 'Rua da Paciência, 20',
        phone: '7133334455',
      });

      const result = await repo.update(domainUnit);

      expect(update).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        data: {
          name: 'Raízes Rio Vermelho',
          address: 'Rua da Paciência, 20',
          city: 'Salvador',
          phone: '7133334455',
        },
      });
      expect(result).toBeInstanceOf(BusinessUnit);
      expect(result?.name).toBe('Raízes Rio Vermelho');
      expect(result?.phone).toBe('7133334455');
    });

    it('translates a P2002 on phone into BusinessUnitAlreadyExistsError naming the phone', async () => {
      const prismaError = knownError('P2002', ['phone']);
      update.mockRejectedValue(prismaError);

      await expect(repo.update(domainUnit)).rejects.toBeInstanceOf(BusinessUnitAlreadyExistsError);
      await expect(repo.update(domainUnit)).rejects.toMatchObject({
        cause: prismaError,
        message: expect.stringContaining('phone') as unknown as string,
      });
    });

    it('returns null on P2025 (row deleted between read and write)', async () => {
      update.mockRejectedValue(knownError('P2025', []));

      await expect(repo.update(domainUnit)).resolves.toBeNull();
    });

    it('rethrows unmapped Prisma error codes unchanged', async () => {
      const prismaError = knownError('P2000', ['phone']);
      update.mockRejectedValue(prismaError);

      await expect(repo.update(domainUnit)).rejects.toBe(prismaError);
    });

    it('rethrows non-Prisma errors unchanged', async () => {
      const genericError = new Error('connection lost');
      update.mockRejectedValue(genericError);

      await expect(repo.update(domainUnit)).rejects.toBe(genericError);
    });

    // Prisma types meta.target loosely. On a non-array it must still resolve a field
    // rather than throw while building the error message.
    it('resolves the conflicting field when meta.target is not an array', async () => {
      update.mockRejectedValue(knownRequestError('P2002', { target: 'phone' }));

      await expect(repo.update(domainUnit)).rejects.toMatchObject({
        message: expect.stringContaining('phone') as unknown as string,
      });
    });

    it('falls back to cnpj when meta is absent entirely', async () => {
      update.mockRejectedValue(knownRequestError('P2002'));

      await expect(repo.update(domainUnit)).rejects.toMatchObject({
        message: expect.stringContaining('cnpj') as unknown as string,
      });
    });
  });

  describe('findById', () => {
    it('returns null when no row matches', async () => {
      findUnique.mockResolvedValue(null);

      await expect(repo.findById('missing')).resolves.toBeNull();
      expect(findUnique).toHaveBeenCalledWith({ where: { id: 'missing' } });
    });

    it('maps the row to a domain BusinessUnit', async () => {
      findUnique.mockResolvedValue(persistedRow);

      const unit = await repo.findById('uuid-1');

      expect(unit).toBeInstanceOf(BusinessUnit);
      expect(unit?.id).toBe('uuid-1');
      expect(unit?.isActive).toBe(true);
    });
  });

  describe('findMany', () => {
    const argsOf = (): Args => findMany.mock.calls[0][0] as Args;

    beforeEach(() => {
      findMany.mockResolvedValue([persistedRow]);
    });

    it('maps every row to a domain BusinessUnit', async () => {
      const units = await repo.findMany({ pagination: { take: 20 } });

      expect(units).toHaveLength(1);
      expect(units[0]).toBeInstanceOf(BusinessUnit);
    });

    it('builds an empty where clause when no filters are given', async () => {
      await repo.findMany({ pagination: { take: 20 } });

      expect(argsOf().where).toStrictEqual({});
    });

    it('matches the search term against the name, case-insensitively', async () => {
      await repo.findMany({ filters: { search: 'pelo' }, pagination: { take: 20 } });

      expect(argsOf().where).toStrictEqual({
        name: { contains: 'pelo', mode: 'insensitive' },
      });
    });

    it('filters by exact city', async () => {
      await repo.findMany({ filters: { city: 'Salvador' }, pagination: { take: 20 } });

      expect(argsOf().where).toStrictEqual({ city: 'Salvador' });
    });

    // isActive:false is a real filter, not an absent one. A truthiness check here
    // would silently list inactive units on the public endpoint.
    it.each([true, false])(
      'filters by isActive=%s rather than treating it as absent',
      async (isActive) => {
        await repo.findMany({ filters: { isActive }, pagination: { take: 20 } });

        expect(argsOf().where).toStrictEqual({ isActive });
      },
    );

    it('AND-combines every filter', async () => {
      await repo.findMany({
        filters: { search: 'pelo', city: 'Salvador', isActive: true },
        pagination: { take: 20 },
      });

      expect(argsOf().where).toStrictEqual({
        name: { contains: 'pelo', mode: 'insensitive' },
        city: 'Salvador',
        isActive: true,
      });
    });

    it('orders by a stable (createdAt, id) key so the cursor cannot skip rows', async () => {
      await repo.findMany({ pagination: { take: 20 } });

      expect(argsOf().orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });

    it('skips the cursor row itself when paging forward', async () => {
      await repo.findMany({ pagination: { take: 20, cursor: 'uuid-0' } });

      expect(argsOf()).toMatchObject({ take: 20, cursor: { id: 'uuid-0' }, skip: 1 });
    });

    it('omits cursor and skip on the first page', async () => {
      await repo.findMany({ pagination: { take: 20 } });

      expect(argsOf()).not.toHaveProperty('cursor');
      expect(argsOf()).not.toHaveProperty('skip');
    });
  });

  describe('setActive', () => {
    it('flips the flag and maps the row back', async () => {
      update.mockResolvedValue({ ...persistedRow, isActive: false });

      const unit = await repo.setActive('uuid-1', false);

      expect(update).toHaveBeenCalledWith({ where: { id: 'uuid-1' }, data: { isActive: false } });
      expect(unit?.isActive).toBe(false);
    });

    // Honour the null contract so the use case raises a 404 instead of leaking a 500.
    it('returns null on P2025 (no unit with that id)', async () => {
      update.mockRejectedValue(knownError('P2025', []));

      await expect(repo.setActive('missing', true)).resolves.toBeNull();
    });

    it('rethrows any other Prisma error unchanged', async () => {
      const prismaError = knownError('P2002', ['phone']);
      update.mockRejectedValue(prismaError);

      await expect(repo.setActive('uuid-1', true)).rejects.toBe(prismaError);
    });

    it('rethrows non-Prisma errors unchanged', async () => {
      const genericError = new Error('connection lost');
      update.mockRejectedValue(genericError);

      await expect(repo.setActive('uuid-1', true)).rejects.toBe(genericError);
    });
  });
});
