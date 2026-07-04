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
  /**
   * Unit authorization scope: when present, results are restricted to these units
   * (`businessUnitId IN (...)`). `undefined` is brand-wide (ADMIN); an empty array
   * matches nothing (a scoped actor whose filter fell outside their claim).
   */
  businessUnitIds?: string[];
  /** Restrict to a single customer's own orders (the customer self-listing path). */
  customerId?: string;
  orderChannel?: OrderChannel;
  orderStatus?: OrderStatus;
}

export interface FindOrdersInput {
  filters?: OrderFilters;
  pagination: CursorPaginationParams;
}

export interface UpdateOrderStatusInput {
  id: string;
  /** The status the caller read; the update only applies if the row still holds it. */
  expectedFrom: OrderStatus;
  orderStatus: OrderStatus;
  /** `null` when the transition is performed by the system (e.g. a payment hook). */
  updatedById: string | null;
}

export interface OrderRepository {
  create(input: CreateOrderInput, tx?: TransactionContext): Promise<Order>;
  /** Pass `tx` to read inside an open transaction (read + later write share one snapshot). */
  findById(id: string, tx?: TransactionContext): Promise<Order | null>;
  findMany(input: FindOrdersInput): Promise<Order[]>;
  /** Returns `null` when no row matched the expected "from" status (concurrent change). */
  updateStatus(input: UpdateOrderStatusInput, tx?: TransactionContext): Promise<Order | null>;
}

export const ORDER_REPOSITORY = Symbol('OrderRepository');
