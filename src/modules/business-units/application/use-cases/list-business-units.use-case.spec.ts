import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  BusinessUnitRepository,
  BUSINESS_UNIT_REPOSITORY,
} from '../../domain/repositories/business-unit.repository';
import { ListBusinessUnitsUseCase } from './list-business-units.use-case';
import { BusinessUnitsFetchError } from '../errors/business-units-fetch.error';
import { BusinessUnit } from '../../domain/entities/business-unit.entity';

describe('ListBusinessUnitsUseCase', () => {
  let useCase: ListBusinessUnitsUseCase;
  let findMany: jest.MockedFunction<BusinessUnitRepository['findMany']>;

  const buildBusinessUnit = (id: string): BusinessUnit =>
    new BusinessUnit(
      id,
      `Unit ${id}`,
      `1234567800019${id}`,
      'Some address',
      'Salvador',
      `713222334${id}`,
      true,
      new Date(),
      new Date(),
    );

  beforeAll(async () => {
    findMany = jest.fn() as jest.MockedFunction<BusinessUnitRepository['findMany']>;

    const mockRepo: jest.Mocked<BusinessUnitRepository> = {
      findById: jest.fn(),
      findMany,
      create: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ListBusinessUnitsUseCase,
        { provide: BUSINESS_UNIT_REPOSITORY, useValue: mockRepo },
      ],
    }).compile();

    useCase = moduleRef.get(ListBusinessUnitsUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should request limit + 1 from the repository to detect a next page', async () => {
      findMany.mockResolvedValue([]);

      await useCase.execute({ limit: 20 });

      expect(findMany).toHaveBeenCalledWith({
        pagination: { cursor: undefined, take: 21 },
        filters: undefined,
      });
    });

    it('should forward cursor and filters to the repository', async () => {
      findMany.mockResolvedValue([]);

      await useCase.execute({
        limit: 10,
        cursor: 'last-id',
        filters: { search: 'pelourinho', city: 'Salvador', isActive: true },
      });

      expect(findMany).toHaveBeenCalledWith({
        pagination: { cursor: 'last-id', take: 11 },
        filters: { search: 'pelourinho', city: 'Salvador', isActive: true },
      });
    });

    it('should return data with hasMore=false and nextCursor=null when fewer than limit + 1 items are returned', async () => {
      findMany.mockResolvedValue([buildBusinessUnit('a'), buildBusinessUnit('b')]);

      const result = await useCase.execute({ limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ limit: 20, hasMore: false, nextCursor: null });
    });

    it('should trim the extra item and expose nextCursor when there is a next page', async () => {
      findMany.mockResolvedValue([
        buildBusinessUnit('a'),
        buildBusinessUnit('b'),
        buildBusinessUnit('c'),
      ]);

      const result = await useCase.execute({ limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.data.map((u) => u.id)).toEqual(['a', 'b']);
      expect(result.meta).toEqual({ limit: 2, hasMore: true, nextCursor: 'b' });
    });

    it('should return an empty page when the repository returns no items', async () => {
      findMany.mockResolvedValue([]);

      const result = await useCase.execute({ limit: 20 });

      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({ limit: 20, hasMore: false, nextCursor: null });
    });

    it('should throw BusinessUnitsFetchError wrapping the original error when the repository fails', async () => {
      const dbError = new Error('DB error');
      findMany.mockRejectedValue(dbError);

      await expect(useCase.execute({ limit: 20 })).rejects.toBeInstanceOf(BusinessUnitsFetchError);
      await expect(useCase.execute({ limit: 20 })).rejects.toMatchObject({ cause: dbError });
    });
  });
});
