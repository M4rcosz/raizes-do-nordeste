import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma, type BusinessUnit as PrismaBusinessUnit } from '@prisma/client';
import { PrismaBusinessUnitRepository } from './prisma-business-unit.repository';
import type { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import type { CreateBusinessUnitInput } from '../../domain/repositories/business-unit.repository';
import { BusinessUnit } from '../../domain/entities/business-unit.entity';
import { BusinessUnitAlreadyExistsError } from '../../domain/errors/business-unit-already-exists.error';

type BusinessUnitCreateFn = (args: unknown) => Promise<PrismaBusinessUnit>;

const knownError = (code: string, target: string[]): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: '7.7.0',
    meta: { target },
  });

describe('PrismaBusinessUnitRepository', () => {
  let create: jest.MockedFunction<BusinessUnitCreateFn>;
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
    const prisma = { businessUnit: { create } } as unknown as PrismaService;
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
});
