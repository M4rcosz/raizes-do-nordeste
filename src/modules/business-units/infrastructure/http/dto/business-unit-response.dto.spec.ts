import { describe, expect, it } from '@jest/globals';
import { BusinessUnit } from '../../../domain/entities/business-unit.entity';
import { BusinessUnitResponseDto } from './business-unit-response.dto';
import { PublicBusinessUnitResponseDto } from './business-unit-public-response.dto';

describe('BusinessUnit response DTOs', () => {
  const createdAt = new Date('2026-01-01T00:00:00Z');
  const updatedAt = new Date('2026-01-02T00:00:00Z');
  const buildBusinessUnit = (): BusinessUnit =>
    new BusinessUnit(
      'uuid-1',
      'Raízes Pelourinho',
      '12345678000190',
      'Largo do Pelourinho, 10',
      'Salvador',
      '7132223344',
      true,
      createdAt,
      updatedAt,
    );

  describe('BusinessUnitResponseDto.fromEntity', () => {
    it('should map every field of the entity', () => {
      const dto = BusinessUnitResponseDto.fromEntity(buildBusinessUnit());

      expect(dto).toBeInstanceOf(BusinessUnitResponseDto);
      expect(dto).toEqual({
        id: 'uuid-1',
        name: 'Raízes Pelourinho',
        cnpj: '12345678000190',
        address: 'Largo do Pelourinho, 10',
        city: 'Salvador',
        phone: '7132223344',
        isActive: true,
        createdAt,
        updatedAt,
      });
    });
  });

  describe('PublicBusinessUnitResponseDto.fromEntity', () => {
    it('should expose only the public fields', () => {
      const dto = PublicBusinessUnitResponseDto.fromEntity(buildBusinessUnit());

      expect(dto).toBeInstanceOf(PublicBusinessUnitResponseDto);
      expect(dto).toEqual({
        id: 'uuid-1',
        name: 'Raízes Pelourinho',
        address: 'Largo do Pelourinho, 10',
        city: 'Salvador',
        phone: '7132223344',
      });
    });

    it('should not leak cnpj, isActive or timestamps', () => {
      const dto = PublicBusinessUnitResponseDto.fromEntity(buildBusinessUnit());

      expect(dto).not.toHaveProperty('cnpj');
      expect(dto).not.toHaveProperty('isActive');
      expect(dto).not.toHaveProperty('createdAt');
      expect(dto).not.toHaveProperty('updatedAt');
    });
  });
});
