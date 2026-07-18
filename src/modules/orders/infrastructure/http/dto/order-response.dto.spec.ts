import { describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { OrderResponseDto } from './order-response.dto';
import { Order } from '@modules/orders/domain/entities/order.entity';
import { OrderItem } from '@modules/orders/domain/entities/order-item.entity';
import { OrderChannel } from '@modules/orders/domain/value-objects/order-channel';

describe('OrderResponseDto.fromEntity', () => {
  const item = new OrderItem('i-1', 'o-1', 'p-1', 2, Money.fromDecimalString('10'), null);
  const order = new Order(
    'o-1',
    'bu-1',
    'c-1',
    'Ana Souza',
    null,
    0,
    5,
    Money.fromDecimalString('20'),
    'note',
    OrderChannel.APP,
    'PENDING',
    new Date('2026-01-01'),
    new Date('2026-01-02'),
    null,
    [item],
  );

  it('serializes money as a 2-decimal string at the boundary', () => {
    const dto = OrderResponseDto.fromEntity(order);

    expect(dto.totalAmount).toBe('20.00');
    expect(dto.orderItems[0].unitPrice).toBe('10.00');
    expect(dto.orderItems[0].subtotal).toBe('20.00');
  });

  it('maps the scalar fields straight through', () => {
    const dto = OrderResponseDto.fromEntity(order);

    expect(dto.customerId).toBe('c-1');
    expect(dto.attendantId).toBeNull();
    expect(dto.pointsEarned).toBe(5);
    expect(dto.orderItems).toHaveLength(1);
  });

  describe('customerName', () => {
    it("exposes the account holder's name alongside the customerId", () => {
      const dto = OrderResponseDto.fromEntity(order);

      expect(dto.customerId).toBe('c-1');
      expect(dto.customerName).toBe('Ana Souza');
    });

    it('exposes the guest name on an order with no customer account', () => {
      const guestOrder = new Order(
        'o-2',
        'bu-1',
        null,
        'Maria',
        'att-1',
        0,
        0,
        Money.fromDecimalString('20'),
        null,
        OrderChannel.TOTEM,
        'PENDING',
        new Date('2026-01-01'),
        new Date('2026-01-02'),
        null,
        [item],
      );

      const dto = OrderResponseDto.fromEntity(guestOrder);

      expect(dto.customerId).toBeNull();
      expect(dto.customerName).toBe('Maria');
    });
  });
});
