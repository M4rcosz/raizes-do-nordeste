import { describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { Product } from './product.entity';

describe('Product', () => {
  const buildProduct = (isActive: boolean): Product =>
    new Product(
      'uuid-1',
      'Açaí',
      'Refreshing fruit pulp',
      Money.fromDecimalString('12.50'),
      isActive,
      'category-uuid-1',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
      'https://example.com/acai.jpg',
    );

  describe('isAvailable', () => {
    it('should return true when the product is active', () => {
      expect(buildProduct(true).isAvailable()).toBe(true);
    });

    it('should return false when the product is inactive', () => {
      expect(buildProduct(false).isAvailable()).toBe(false);
    });
  });

  describe('constructor', () => {
    it('should preserve all immutable fields', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');
      const price = Money.fromDecimalString('12.50');
      const product = new Product(
        'uuid-1',
        'Açaí',
        null,
        price,
        true,
        'category-uuid-1',
        createdAt,
        updatedAt,
        'https://example.com/acai.jpg',
      );

      expect(product.id).toBe('uuid-1');
      expect(product.name).toBe('Açaí');
      expect(product.description).toBeNull();
      expect(product.price).toBe(price);
      expect(product.isActive).toBe(true);
      expect(product.categoryId).toBe('category-uuid-1');
      expect(product.createdAt).toBe(createdAt);
      expect(product.updatedAt).toBe(updatedAt);
      expect(product.imageUrl).toBe('https://example.com/acai.jpg');
    });
  });
});
