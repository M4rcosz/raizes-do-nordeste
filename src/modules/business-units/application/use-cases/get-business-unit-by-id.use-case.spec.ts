import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  BusinessUnitRepository,
  BUSINESS_UNIT_REPOSITORY,
} from '../../domain/repositories/business-unit.repository';
import { GetBusinessUnitByIdUseCase } from './get-business-unit-by-id.use-case';
import { BusinessUnitsFetchError } from '../errors/business-units-fetch.error';
import { BusinessUnitNotFoundError } from '../errors/business-unit-not-found.error';
import { BusinessUnit } from '../../domain/entities/business-unit.entity';

describe('GetBusinessUnitByIdUseCase', () => {
  let useCase: GetBusinessUnitByIdUseCase;
  let findById: jest.MockedFunction<BusinessUnitRepository['findById']>;

  const buildBusinessUnit = (isActive: boolean): BusinessUnit =>
    new BusinessUnit(
      'uuid-1',
      'Raízes Pelourinho',
      '12345678000190',
      'Largo do Pelourinho, 10',
      'Salvador',
      '7132223344',
      isActive,
      new Date(),
      new Date(),
    );

  beforeAll(async () => {
    findById = jest.fn() as jest.MockedFunction<BusinessUnitRepository['findById']>;

    const mockRepo: jest.Mocked<BusinessUnitRepository> = {
      findById,
      findMany: jest.fn(),
      create: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        GetBusinessUnitByIdUseCase,
        { provide: BUSINESS_UNIT_REPOSITORY, useValue: mockRepo },
      ],
    }).compile();

    useCase = moduleRef.get(GetBusinessUnitByIdUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should return the unit when it exists and activeOnly is false', async () => {
      const unit = buildBusinessUnit(true);
      findById.mockResolvedValue(unit);

      const result = await useCase.execute('uuid-1', { activeOnly: false });

      expect(findById).toHaveBeenCalledWith('uuid-1');
      expect(result).toBe(unit);
    });

    it('should return an inactive unit when activeOnly is false', async () => {
      const unit = buildBusinessUnit(false);
      findById.mockResolvedValue(unit);

      const result = await useCase.execute('uuid-1', { activeOnly: false });

      expect(result).toBe(unit);
    });

    it('should throw BusinessUnitNotFoundError when the unit does not exist', async () => {
      findById.mockResolvedValue(null);

      await expect(useCase.execute('missing', { activeOnly: false })).rejects.toBeInstanceOf(
        BusinessUnitNotFoundError,
      );
    });

    it('should throw BusinessUnitNotFoundError when activeOnly is true and the unit is inactive', async () => {
      findById.mockResolvedValue(buildBusinessUnit(false));

      await expect(useCase.execute('uuid-1', { activeOnly: true })).rejects.toBeInstanceOf(
        BusinessUnitNotFoundError,
      );
    });

    it('should return the unit when activeOnly is true and the unit is active', async () => {
      const unit = buildBusinessUnit(true);
      findById.mockResolvedValue(unit);

      const result = await useCase.execute('uuid-1', { activeOnly: true });

      expect(result).toBe(unit);
    });

    it('should throw BusinessUnitsFetchError wrapping the original error when the repository fails', async () => {
      const dbError = new Error('DB error');
      findById.mockRejectedValue(dbError);

      await expect(useCase.execute('uuid-1', { activeOnly: false })).rejects.toBeInstanceOf(
        BusinessUnitsFetchError,
      );
      await expect(useCase.execute('uuid-1', { activeOnly: false })).rejects.toMatchObject({
        cause: dbError,
      });
    });
  });
});
