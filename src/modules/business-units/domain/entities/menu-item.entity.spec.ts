import { describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { MenuItem } from './menu-item.entity';

describe('MenuItem', () => {
  describe('constructor', () => {
    it('should preserve all immutable fields', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');
      const customPrice = Money.fromDecimalString('15.90');

      const item = new MenuItem(
        'menu-item-1',
        'business-unit-1',
        'product-1',
        customPrice,
        true,
        createdAt,
        updatedAt,
      );

      expect(item.id).toBe('menu-item-1');
      expect(item.businessUnitId).toBe('business-unit-1');
      expect(item.productId).toBe('product-1');
      expect(item.customPrice).toBe(customPrice);
      expect(item.isAvailable).toBe(true);
      expect(item.createdAt).toBe(createdAt);
      expect(item.updatedAt).toBe(updatedAt);
    });
  });
});
