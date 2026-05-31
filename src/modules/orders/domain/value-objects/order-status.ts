export const OrderStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/**
 * Allowed forward transitions for an order. DELIVERED and CANCELLED are terminal.
 * The status itself never appears as its own target (no-op transitions are invalid).
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY, OrderStatus.CANCELLED],
  READY: [OrderStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean =>
  ORDER_STATUS_TRANSITIONS[from].includes(to);
