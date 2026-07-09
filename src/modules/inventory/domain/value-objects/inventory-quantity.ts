/**
 * Upper bound for any quantity that reaches the inventory tables. Both
 * `inventories.quantity` and `inventory_transactions.quantity` are Postgres
 * int4, so a larger value passes class-validator's @IsInt (which allows up to
 * Number.MAX_SAFE_INTEGER) and then fails at INSERT as a 500. Bounding it at the
 * DTO turns that into a 400.
 */
export const MAX_INVENTORY_QUANTITY = 2_147_483_647;
