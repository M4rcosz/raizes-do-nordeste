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

  describe('withUpdatedFields', () => {
    it('overwrites only the provided fields', () => {
      const product = buildProduct(true);

      const updated = product.withUpdatedFields({
        name: 'Vatapá',
        price: Money.fromDecimalString('20.00'),
      });

      expect(updated.name).toBe('Vatapá');
      expect(updated.price.equals(Money.fromDecimalString('20.00'))).toBe(true);
      // Untouched fields carry over.
      expect(updated.description).toBe(product.description);
      expect(updated.categoryId).toBe(product.categoryId);
      expect(updated.imageUrl).toBe(product.imageUrl);
    });

    it('preserves identity and lifecycle fields', () => {
      const product = buildProduct(false);

      const updated = product.withUpdatedFields({ name: 'Vatapá' });

      expect(updated.id).toBe(product.id);
      expect(updated.isActive).toBe(product.isActive);
      expect(updated.createdAt).toBe(product.createdAt);
      expect(updated.updatedAt).toBe(product.updatedAt);
    });

    it('does not mutate the receiver', () => {
      const product = buildProduct(true);

      product.withUpdatedFields({ name: 'Vatapá' });

      expect(product.name).toBe('Açaí');
    });

    it('leaves everything unchanged when the patch is empty', () => {
      const product = buildProduct(true);

      const updated = product.withUpdatedFields({});

      expect(updated.name).toBe(product.name);
      expect(updated.description).toBe(product.description);
      expect(updated.price).toBe(product.price);
      expect(updated.categoryId).toBe(product.categoryId);
      expect(updated.imageUrl).toBe(product.imageUrl);
    });

    it('clears description when null is explicitly provided', () => {
      const product = buildProduct(true);

      const updated = product.withUpdatedFields({ description: null });

      expect(updated.description).toBeNull();
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
