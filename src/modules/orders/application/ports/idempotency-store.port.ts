import type { TransactionContext } from '@shared/transaction/transaction-runner.port';

/** Identifies one logical operation: the same key under the same user+endpoint. */
export interface IdempotencyScope {
  key: string;
  userId: string;
  endpoint: string;
}

/** What a previously recorded key holds: the body hash it was created with and the result. */
export interface ExistingIdempotencyRecord {
  requestHash: string;
  orderId: string | null;
}

export interface RecordIdempotencyInput extends IdempotencyScope {
  requestHash: string;
  orderId: string;
  expiresAt: Date;
}

/**
 * Stores idempotency keys for order creation. `record` runs inside the order's
 * transaction so the key and the order commit together; a duplicate key surfaces
 * as IdempotencyRaceError (the concurrent winner already committed).
 */
export interface IdempotencyStore {
  find(scope: IdempotencyScope): Promise<ExistingIdempotencyRecord | null>;
  record(input: RecordIdempotencyInput, tx: TransactionContext): Promise<void>;
  /** Reaps keys past their TTL (expiresAt < now). Returns how many rows were removed. */
  deleteExpired(now: Date): Promise<number>;
}

export const IDEMPOTENCY_STORE = Symbol('IdempotencyStore');
