import { Order } from '../entities/order.entity';
import type { OrderChannel } from '../value-objects/order-channel';

export interface CreateOrderItem {
  productId: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  notes?: string;
}

export interface CreateOrderInput {
  businessUnitId: string;
  customerId?: string | null;
  attendantId?: string | null;
  totalAmount: string;
  pointsRedeemed?: number;
  notes?: string | null;
  orderChannel: OrderChannel;
  orderItems: CreateOrderItem[];
}

export interface OrderRepository {
  create(input: CreateOrderInput): Promise<Order>;
}

export const ORDER_REPOSITORY = Symbol('OrderRepository');
