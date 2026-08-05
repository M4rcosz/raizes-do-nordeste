import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  type CreateBusinessUnitInput,
  BusinessUnitRepository,
  BUSINESS_UNIT_REPOSITORY,
} from '../../domain/repositories/business-unit.repository';
import { CreateBusinessUnitUseCase } from './create-business-unit.use-case';
import { BusinessUnit } from '../../domain/entities/business-unit.entity';
import { BusinessUnitAlreadyExistsError } from '../../domain/errors/business-unit-already-exists.error';

describe('CreateBusinessUnitUseCase', () => {
  let useCase: CreateBusinessUnitUseCase;
  let create: jest.MockedFunction<BusinessUnitRepository['create']>;

  const input: CreateBusinessUnitInput = {
    name: 'Nexio Pelourinho',
    cnpj: '12345678000190',
    address: 'Largo do Pelourinho, 10',
    city: 'Salvador',
    phone: '7132223344',
  };

  beforeAll(async () => {
    create = jest.fn() as jest.MockedFunction<BusinessUnitRepository['create']>;

    const mockRepo: jest.Mocked<BusinessUnitRepository> = {
      findById: jest.fn(),
      findMany: jest.fn(),
      create,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CreateBusinessUnitUseCase,
        { provide: BUSINESS_UNIT_REPOSITORY, useValue: mockRepo },
      ],
    }).compile();

    useCase = moduleRef.get(CreateBusinessUnitUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should delegate to the repository and return the created business unit', async () => {
      const created = new BusinessUnit(
        'uuid-1',
        input.name,
        input.cnpj,
        input.address,
        input.city,
        input.phone,
        true,
        new Date(),
        new Date(),
      );
      create.mockResolvedValue(created);

      const result = await useCase.execute(input);

      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith(input);
      expect(result).toBe(created);
    });

    it('should propagate domain errors raised by the repository', async () => {
      const domainError = new BusinessUnitAlreadyExistsError(
        'A business unit with cnpj "12345678000190" already exists.',
      );
      create.mockRejectedValue(domainError);

      await expect(useCase.execute(input)).rejects.toBe(domainError);
    });
  });
});
