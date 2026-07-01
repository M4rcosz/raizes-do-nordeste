export const PaymentStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  APPROVED: 'APPROVED',
  REFUSED: 'REFUSED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/**
 * Statuses that occupy the "one live attempt per order" slot. Kept in sync with the
 * partial unique index in the payments migration - a refused/cancelled attempt frees
 * the slot so the order can be paid again.
 */
export const LIVE_PAYMENT_STATUSES = [
  PaymentStatus.PENDING,
  PaymentStatus.PROCESSING,
  PaymentStatus.APPROVED,
] as const;

/**
 * Non-terminal statuses a gateway webhook may settle from. Used as the WHERE guard of the
 * conditional settle so concurrent webhook redeliveries apply the outcome exactly once.
 */
export const SETTLEABLE_PAYMENT_STATUSES = [
  PaymentStatus.PENDING,
  PaymentStatus.PROCESSING,
] as const;
