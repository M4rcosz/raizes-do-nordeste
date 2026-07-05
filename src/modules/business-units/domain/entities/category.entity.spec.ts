import { describe, expect, it } from '@jest/globals';
import { Category } from './category.entity';

describe('Category', () => {
  const buildCategory = (isActive: boolean): Category =>
    new Category(
      'uuid-1',
      'Bebidas',
      'Sucos e refrigerantes',
      isActive,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );

  describe('isAvailable', () => {
    it('should return true when the category is active', () => {
      expect(buildCategory(true).isAvailable()).toBe(true);
    });

    it('should return false when the category is inactive', () => {
      expect(buildCategory(false).isAvailable()).toBe(false);
    });
  });

  describe('withUpdatedFields', () => {
    it('overwrites only the provided fields', () => {
      const category = buildCategory(true);

      const updated = category.withUpdatedFields({ name: 'Sobremesas' });

      expect(updated.name).toBe('Sobremesas');
      // Untouched fields carry over.
      expect(updated.description).toBe(category.description);
      expect(updated.isActive).toBe(category.isActive);
    });

    it('toggles isActive when provided', () => {
      const category = buildCategory(true);

      const updated = category.withUpdatedFields({ isActive: false });

      expect(updated.isActive).toBe(false);
      expect(updated.name).toBe(category.name);
    });

    it('preserves identity and lifecycle timestamps', () => {
      const category = buildCategory(false);

      const updated = category.withUpdatedFields({ name: 'Sobremesas' });

      expect(updated.id).toBe(category.id);
      expect(updated.createdAt).toBe(category.createdAt);
      expect(updated.updatedAt).toBe(category.updatedAt);
    });

    it('does not mutate the receiver', () => {
      const category = buildCategory(true);

      category.withUpdatedFields({ name: 'Sobremesas' });

      expect(category.name).toBe('Bebidas');
    });

    it('leaves everything unchanged when the patch is empty', () => {
      const category = buildCategory(true);

      const updated = category.withUpdatedFields({});

      expect(updated.name).toBe(category.name);
      expect(updated.description).toBe(category.description);
      expect(updated.isActive).toBe(category.isActive);
    });

    it('clears description when null is explicitly provided', () => {
      const category = buildCategory(true);

      const updated = category.withUpdatedFields({ description: null });

      expect(updated.description).toBeNull();
    });
  });

  describe('constructor', () => {
    it('should preserve all immutable fields', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');
      const category = new Category('uuid-1', 'Bebidas', null, true, createdAt, updatedAt);

      expect(category.id).toBe('uuid-1');
      expect(category.name).toBe('Bebidas');
      expect(category.description).toBeNull();
      expect(category.isActive).toBe(true);
      expect(category.createdAt).toBe(createdAt);
      expect(category.updatedAt).toBe(updatedAt);
    });
  });
});
