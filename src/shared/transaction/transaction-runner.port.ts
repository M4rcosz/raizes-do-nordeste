export const TRANSACTION_RUNNER = Symbol('TransactionRunner');

/**
 * Opaque handle to an open transaction. The application layer only passes it
 * through to repositories/ports; the concrete type (a Prisma transaction client)
 * is known exclusively by the persistence adapters that cast it at the boundary.
 */
export type TransactionContext = unknown;

export interface TransactionRunner {
  /**
   * Runs `work` inside a single database transaction, passing the transaction
   * context that collaborating ports must forward so their reads and writes
   * share the same atomic unit. Rolls back if `work` throws.
   */
  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
}
