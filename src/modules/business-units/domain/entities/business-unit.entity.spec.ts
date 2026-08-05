import { describe, expect, it } from '@jest/globals';
import { BusinessUnit } from './business-unit.entity';

describe('BusinessUnit', () => {
  const buildBusinessUnit = (isActive: boolean): BusinessUnit =>
    new BusinessUnit(
      'uuid-1',
      'Nexio Pelourinho',
      '12345678000190',
      'Largo do Pelourinho, 10',
      'Salvador',
      '7132223344',
      isActive,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );

  describe('isAvailable', () => {
    it('should return true when the business unit is active', () => {
      expect(buildBusinessUnit(true).isAvailable()).toBe(true);
    });

    it('should return false when the business unit is inactive', () => {
      expect(buildBusinessUnit(false).isAvailable()).toBe(false);
    });
  });

  describe('withUpdatedFields', () => {
    it('overwrites only the provided fields', () => {
      const unit = buildBusinessUnit(true);

      const updated = unit.withUpdatedFields({
        name: 'Nexio Rio Vermelho',
        phone: '7133334455',
      });

      expect(updated.name).toBe('Nexio Rio Vermelho');
      expect(updated.phone).toBe('7133334455');
      // Untouched fields carry over.
      expect(updated.address).toBe(unit.address);
      expect(updated.city).toBe(unit.city);
    });

    it('preserves identity and lifecycle fields', () => {
      const unit = buildBusinessUnit(false);

      const updated = unit.withUpdatedFields({ name: 'Nexio Rio Vermelho' });

      expect(updated.id).toBe(unit.id);
      expect(updated.cnpj).toBe(unit.cnpj);
      expect(updated.isActive).toBe(unit.isActive);
      expect(updated.createdAt).toBe(unit.createdAt);
      expect(updated.updatedAt).toBe(unit.updatedAt);
    });

    it('does not mutate the receiver', () => {
      const unit = buildBusinessUnit(true);

      unit.withUpdatedFields({ name: 'Nexio Rio Vermelho' });

      expect(unit.name).toBe('Nexio Pelourinho');
    });

    it('leaves everything unchanged when the patch is empty', () => {
      const unit = buildBusinessUnit(true);

      const updated = unit.withUpdatedFields({});

      expect(updated.name).toBe(unit.name);
      expect(updated.address).toBe(unit.address);
      expect(updated.city).toBe(unit.city);
      expect(updated.phone).toBe(unit.phone);
    });
  });

  describe('constructor', () => {
    it('should preserve all immutable fields', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');
      const unit = new BusinessUnit(
        'uuid-1',
        'Nexio Pelourinho',
        '12345678000190',
        'Largo do Pelourinho, 10',
        'Salvador',
        '7132223344',
        true,
        createdAt,
        updatedAt,
      );

      expect(unit.id).toBe('uuid-1');
      expect(unit.name).toBe('Nexio Pelourinho');
      expect(unit.cnpj).toBe('12345678000190');
      expect(unit.address).toBe('Largo do Pelourinho, 10');
      expect(unit.city).toBe('Salvador');
      expect(unit.phone).toBe('7132223344');
      expect(unit.isActive).toBe(true);
      expect(unit.createdAt).toBe(createdAt);
      expect(unit.updatedAt).toBe(updatedAt);
    });
  });
});
