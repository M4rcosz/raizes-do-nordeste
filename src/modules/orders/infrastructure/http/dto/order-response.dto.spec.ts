import { describe, expect, it } from '@jest/globals';
import Big from 'big.js';
import { OrderResponseDto } from './order-response.dto';
import { Order } from '@modules/orders/domain/entities/order.entity';
import { OrderItem } from '@modules/orders/domain/entities/order-item.entity';
import { OrderChannel } from '@modules/orders/domain/value-objects/order-channel';

describe('OrderResponseDto.fromEntity', () => {
  const item = new OrderItem('i-1', 'o-1', 'p-1', 2, new Big('10'), null);
  const order = new Order(
    'o-1',
    'bu-1',
    'c-1',
    null,
    0,
    5,
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
});
