import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import type { CursorPaginationParams } from '@shared/pagination/pagination';
import { Order } from '../entities/order.entity';
import type { OrderChannel } from '../value-objects/order-channel';
import type { OrderStatus } from '../value-objects/order-status';

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

export interface OrderFilters {
  businessUnitId?: string;
  orderChannel?: OrderChannel;
  orderStatus?: OrderStatus;
}

export interface FindOrdersInput {
  filters?: OrderFilters;
  pagination: CursorPaginationParams;
}

export interface UpdateOrderStatusInput {
  id: string;
  orderStatus: OrderStatus;
  updatedById: string;
}

export interface OrderRepository {
  create(input: CreateOrderInput, tx?: TransactionContext): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  findMany(input: FindOrdersInput): Promise<Order[]>;
  updateStatus(input: UpdateOrderStatusInput): Promise<Order>;
}

export const ORDER_REPOSITORY = Symbol('OrderRepository');
