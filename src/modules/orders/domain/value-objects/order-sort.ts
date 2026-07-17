/**
 * Closed allowlist of sortable order columns. The wire value is the Prisma/entity
 * field name, so the repository can map it straight to an orderBy term without
 * ever accepting a caller-supplied column name.
 */
export const OrderSortField = {
  CREATED_AT: 'createdAt',
  TOTAL_AMOUNT: 'totalAmount',
} as const;

export type OrderSortField = (typeof OrderSortField)[keyof typeof OrderSortField];

export const SortDirection = {
  ASC: 'asc',
  DESC: 'desc',
} as const;

export type SortDirection = (typeof SortDirection)[keyof typeof SortDirection];

export interface OrderSort {
  field: OrderSortField;
  direction: SortDirection;
}

/** Preserves the listing behaviour that predates the sort parameters. */
export const DEFAULT_ORDER_SORT: OrderSort = {
  field: OrderSortField.CREATED_AT,
  direction: SortDirection.DESC,
};

export const isOrderSortField = (value: unknown): value is OrderSortField =>
  typeof value === 'string' && Object.values<string>(OrderSortField).includes(value);

export const isSortDirection = (value: unknown): value is SortDirection =>
  typeof value === 'string' && Object.values<string>(SortDirection).includes(value);
