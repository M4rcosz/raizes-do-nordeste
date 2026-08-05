import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { BusinessUnitsController } from './business-units.controller';
import { CreateBusinessUnitUseCase } from '../../../application/use-cases/create-business-unit.use-case';
import { ListBusinessUnitsUseCase } from '../../../application/use-cases/list-business-units.use-case';
import { GetBusinessUnitByIdUseCase } from '../../../application/use-cases/get-business-unit-by-id.use-case';
import { SetBusinessUnitActiveUseCase } from '../../../application/use-cases/set-business-unit-active.use-case';
import { UpdateBusinessUnitUseCase } from '../../../application/use-cases/update-business-unit.use-case';
import { BusinessUnit } from '../../../domain/entities/business-unit.entity';
import { BusinessUnitResponseDto } from '../dto/business-unit-response.dto';
import { PublicBusinessUnitResponseDto } from '../dto/business-unit-public-response.dto';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { BusinessUnitNotFoundError } from '../../../application/errors/business-unit-not-found.error';
import { BusinessUnitCreateDto } from '../dto/business-unit-create.dto';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';

const actor = { sub: 'admin-1' } as JwtPayload;

describe('BusinessUnitsController', () => {
  let controller: BusinessUnitsController;
  let createBusinessUnit: jest.Mocked<CreateBusinessUnitUseCase>;
  let listBusinessUnits: jest.Mocked<ListBusinessUnitsUseCase>;
  let getBusinessUnitById: jest.Mocked<GetBusinessUnitByIdUseCase>;
  let setBusinessUnitActive: jest.Mocked<SetBusinessUnitActiveUseCase>;
  let updateBusinessUnit: jest.Mocked<UpdateBusinessUnitUseCase>;

  const buildBusinessUnit = (id = 'uuid-1'): BusinessUnit =>
    new BusinessUnit(
      id,
      'Nexio Pelourinho',
      '12345678000190',
      'Largo do Pelourinho, 10',
      'Salvador',
      '7132223344',
      true,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );

  beforeAll(async () => {
    createBusinessUnit = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateBusinessUnitUseCase>;
    listBusinessUnits = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListBusinessUnitsUseCase>;
    getBusinessUnitById = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetBusinessUnitByIdUseCase>;
    setBusinessUnitActive = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<SetBusinessUnitActiveUseCase>;
    updateBusinessUnit = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateBusinessUnitUseCase>;

    const moduleRef = await Test.createTestingModule({
      controllers: [BusinessUnitsController],
      providers: [
        { provide: CreateBusinessUnitUseCase, useValue: createBusinessUnit },
        { provide: ListBusinessUnitsUseCase, useValue: listBusinessUnits },
        { provide: GetBusinessUnitByIdUseCase, useValue: getBusinessUnitById },
        { provide: SetBusinessUnitActiveUseCase, useValue: setBusinessUnitActive },
        { provide: UpdateBusinessUnitUseCase, useValue: updateBusinessUnit },
      ],
    }).compile();

    controller = moduleRef.get(BusinessUnitsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should map the created unit to its full response DTO', async () => {
      createBusinessUnit.execute.mockResolvedValue(buildBusinessUnit('uuid-43'));

      const body: BusinessUnitCreateDto = {
        name: 'Nexio Pelourinho',
        cnpj: '12345678000190',
        address: 'Largo do Pelourinho, 10',
        city: 'Salvador',
        phone: '7132223344',
      };

      const response = await controller.create(body);

      expect(createBusinessUnit.execute).toHaveBeenCalledWith(body);
      expect(response).toBeInstanceOf(BusinessUnitResponseDto);
      expect(response.id).toBe('uuid-43');
      expect(response.cnpj).toBe('12345678000190');
    });
  });

  describe('update', () => {
    it('should forward the patch with the actor and map the result to the full DTO', async () => {
      updateBusinessUnit.execute.mockResolvedValue(buildBusinessUnit('uuid-7'));

      const body = { name: 'Nexio Rio Vermelho', phone: '7133334455' };

      const response = await controller.update(actor, { id: 'uuid-7' }, body);

      expect(updateBusinessUnit.execute).toHaveBeenCalledWith('uuid-7', body, 'admin-1');
      expect(response).toBeInstanceOf(BusinessUnitResponseDto);
      expect(response.id).toBe('uuid-7');
    });

    it('should propagate BusinessUnitNotFoundError raised by the use-case', async () => {
      updateBusinessUnit.execute.mockRejectedValue(
        new BusinessUnitNotFoundError('Business unit not found.'),
      );

      await expect(
        controller.update(actor, { id: 'missing' }, { name: 'Nexio Rio Vermelho' }),
      ).rejects.toBeInstanceOf(BusinessUnitNotFoundError);
    });
  });

  describe('activate', () => {
    it('should call the use-case with isActive=true and map the result', async () => {
      setBusinessUnitActive.execute.mockResolvedValue(buildBusinessUnit('uuid-7'));

      const response = await controller.activate(actor, { id: 'uuid-7' });

      expect(setBusinessUnitActive.execute).toHaveBeenCalledWith('uuid-7', true, 'admin-1');
      expect(response).toBeInstanceOf(BusinessUnitResponseDto);
      expect(response.id).toBe('uuid-7');
    });
  });

  describe('deactivate', () => {
    it('should call the use-case with isActive=false and map the result', async () => {
      setBusinessUnitActive.execute.mockResolvedValue(buildBusinessUnit('uuid-7'));

      const response = await controller.deactivate(actor, { id: 'uuid-7' });

      expect(setBusinessUnitActive.execute).toHaveBeenCalledWith('uuid-7', false, 'admin-1');
      expect(response).toBeInstanceOf(BusinessUnitResponseDto);
    });

    it('should propagate BusinessUnitNotFoundError raised by the use-case', async () => {
      setBusinessUnitActive.execute.mockRejectedValue(
        new BusinessUnitNotFoundError('Business unit not found.'),
      );

      await expect(controller.deactivate(actor, { id: 'missing' })).rejects.toBeInstanceOf(
        BusinessUnitNotFoundError,
      );
    });
  });

  describe('findInternal', () => {
    it('should return a paginated envelope of full DTOs and forward filters', async () => {
      listBusinessUnits.execute.mockResolvedValue({
        data: [buildBusinessUnit()],
        meta: { limit: 20, hasMore: false, nextCursor: null },
      });

      const response = await controller.findInternal({
        limit: 20,
        search: 'pelourinho',
        city: 'Salvador',
        isActive: false,
      });

      expect(listBusinessUnits.execute).toHaveBeenCalledWith({
        cursor: undefined,
        limit: 20,
        filters: { search: 'pelourinho', city: 'Salvador', isActive: false },
      });
      expect(response).toBeInstanceOf(PaginatedResponseDto);
      expect(response.data[0]).toBeInstanceOf(BusinessUnitResponseDto);
    });

    it('should clamp out-of-range limits to MAX_LIMIT', async () => {
      listBusinessUnits.execute.mockResolvedValue({
        data: [],
        meta: { limit: 100, hasMore: false, nextCursor: null },
      });

      await controller.findInternal({ limit: 99999 });

      expect(listBusinessUnits.execute).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
      );
    });

    it('should pass undefined filters when no filter is provided', async () => {
      listBusinessUnits.execute.mockResolvedValue({
        data: [],
        meta: { limit: 20, hasMore: false, nextCursor: null },
      });

      await controller.findInternal({ limit: 20 });

      expect(listBusinessUnits.execute).toHaveBeenCalledWith({
        cursor: undefined,
        limit: 20,
        filters: undefined,
      });
    });
  });

  describe('findInternalById', () => {
    it('should return the full DTO and request the unit without the active filter', async () => {
      getBusinessUnitById.execute.mockResolvedValue(buildBusinessUnit('uuid-42'));

      const response = await controller.findInternalById({ id: 'uuid-42' });

      expect(getBusinessUnitById.execute).toHaveBeenCalledWith('uuid-42', { activeOnly: false });
      expect(response).toBeInstanceOf(BusinessUnitResponseDto);
      expect(response.id).toBe('uuid-42');
    });
  });

  describe('findActive', () => {
    it('should force isActive=true and return public DTOs', async () => {
      listBusinessUnits.execute.mockResolvedValue({
        data: [buildBusinessUnit()],
        meta: { limit: 20, hasMore: false, nextCursor: null },
      });

      const response = await controller.findActive({
        limit: 20,
        search: 'pelourinho',
        city: 'Salvador',
        // even when a caller smuggles isActive=false, the public route ignores it
        isActive: false,
      });

      expect(listBusinessUnits.execute).toHaveBeenCalledWith({
        cursor: undefined,
        limit: 20,
        filters: { search: 'pelourinho', city: 'Salvador', isActive: true },
      });
      expect(response).toBeInstanceOf(PaginatedResponseDto);
      expect(response.data[0]).toBeInstanceOf(PublicBusinessUnitResponseDto);
    });
  });

  describe('findById', () => {
    it('should return the public DTO and request the unit with activeOnly=true', async () => {
      getBusinessUnitById.execute.mockResolvedValue(buildBusinessUnit('uuid-42'));

      const response = await controller.findById({ id: 'uuid-42' });

      expect(getBusinessUnitById.execute).toHaveBeenCalledWith('uuid-42', { activeOnly: true });
      expect(response).toBeInstanceOf(PublicBusinessUnitResponseDto);
      expect(response.id).toBe('uuid-42');
    });

    it('should propagate BusinessUnitNotFoundError raised by the use-case', async () => {
      getBusinessUnitById.execute.mockRejectedValue(
        new BusinessUnitNotFoundError('Business unit not found.'),
      );

      await expect(controller.findById({ id: 'missing' })).rejects.toBeInstanceOf(
        BusinessUnitNotFoundError,
      );
    });
  });
});
