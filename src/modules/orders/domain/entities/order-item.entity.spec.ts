import { describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { OrderItem } from './order-item.entity';

describe('OrderItem', () => {
  describe('calculateSubtotal', () => {
    it('multiplies unit price by quantity preserving decimals', () => {
      expect(OrderItem.calculateSubtotal(3, '12.50').equals(Money.fromDecimalString('37.5'))).toBe(
        true,
      );
    });

    it('returns the unit price when quantity is 1', () => {
      expect(OrderItem.calculateSubtotal(1, '9.99').equals(Money.fromDecimalString('9.99'))).toBe(
        true,
      );
    });
  });

  describe('constructor enforces the subtotal invariant', () => {
    it('computes subtotal from quantity and unitPrice - caller cannot pass an inconsistent value', () => {
      const item = new OrderItem(
        'i-1',
        'o-1',
        'p-1',
        'Baiao de Dois',
        4,
        Money.fromDecimalString('7.25'),
        null,
      );

      expect(item.subtotal.equals(Money.fromDecimalString('29'))).toBe(true);
    });
  });
});
