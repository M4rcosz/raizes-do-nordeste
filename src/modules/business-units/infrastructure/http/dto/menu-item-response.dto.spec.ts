import { describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { MenuItem } from '../../../domain/entities/menu-item.entity';
import { MenuItemResponseDto } from './menu-item-response.dto';

describe('MenuItemResponseDto', () => {
  describe('fromEntity', () => {
    it('should map a MenuItem entity to its response DTO and serialize Money as a decimal string', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');
      const item = new MenuItem(
        'menu-item-1',
        'bu-1',
        'product-1',
        Money.fromDecimalString('18.5'),
        true,
        createdAt,
        updatedAt,
      );

      const dto = MenuItemResponseDto.fromEntity(item);

      expect(dto).toBeInstanceOf(MenuItemResponseDto);
      expect(dto).toEqual({
        id: 'menu-item-1',
        businessUnitId: 'bu-1',
        productId: 'product-1',
        customPrice: '18.50',
        isAvailable: true,
        createdAt,
        updatedAt,
      });
    });
  });
});
