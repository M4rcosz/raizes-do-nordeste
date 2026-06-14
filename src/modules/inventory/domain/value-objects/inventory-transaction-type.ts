export const InventoryTransactionType = {
  IN: 'IN',
  OUT: 'OUT',
  ADJUSTMENT: 'ADJUSTMENT',
  RESERVE: 'RESERVE',
} as const;

export type InventoryTransactionType =
  (typeof InventoryTransactionType)[keyof typeof InventoryTransactionType];

/**
 * Movement types a manager may apply through the adjust endpoint. ADJUSTMENT and
 * RESERVE exist in the schema for future flows (stock counts, order reservation)
 * and are not accepted from the API yet.
 */
export const MANUAL_MOVEMENT_TYPES = [
  InventoryTransactionType.IN,
  InventoryTransactionType.OUT,
] as const;

export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];
