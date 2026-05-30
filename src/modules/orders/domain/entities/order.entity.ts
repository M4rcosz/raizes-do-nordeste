import Big from 'big.js';
import type { OrderStatus } from '../value-objects/order-status';
import type { OrderChannel } from '../value-objects/order-channel';
import { OrderItem } from './order-item.entity';

export class Order {
  public readonly totalAmount: Big;

  constructor(
    public readonly id: string,
    public readonly businessUnitId: string,
    public readonly customerId: string | null,
    public readonly attendantId: string | null,
    public readonly pointsRedeemed: number,
    public readonly pointsEarned: number,
    public readonly notes: string | null,
    public readonly orderChannel: OrderChannel,
    public readonly orderStatus: OrderStatus,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly updatedById: string | null,
    public readonly orderItems: OrderItem[],
  ) {
    this.totalAmount = Order.calculateTotalAmount(orderItems.map((i) => i.subtotal));
  }

  static calculateTotalAmount(subtotals: ReadonlyArray<Big | string>): Big {
    return subtotals.reduce<Big>((acc, curr) => acc.plus(new Big(curr)), new Big(0));
  }
}
