import type { TransactionContext } from '@shared/transaction/transaction-runner.port';

/** One metered model call. Append-only: nothing ever updates or deletes a row. */
export interface AiTokenUsageEntry {
  userId: string;
  /** The thread the spend happened in, when there was one. Never required. */
  conversationId: string | null;
  /** Tokens actually debited, always positive. */
  tokensUsed: number;
}

/** Per-user total over the requested window. Users with no spend are absent. */
export interface AiTokenUsageTotal {
  userId: string;
  tokensUsed: number;
}

export interface AiTokenUsageRepository {
  /**
   * Appends one ledger row. `tx` is how the caller keeps it in the SAME transaction
   * as the balance debit: if the row and the decrement could land apart, the
   * reported spend and the remaining balance would drift with no way to reconcile.
   */
  record(entry: AiTokenUsageEntry, tx?: TransactionContext): Promise<void>;
  /**
   * Totals spend per user over [from, to] in a single grouped query - one row per
   * user, not one query per user. An empty `userIds` returns [] without querying.
   */
  sumByUserInPeriod(userIds: string[], from: Date, to: Date): Promise<AiTokenUsageTotal[]>;
}

export const AI_TOKEN_USAGE_REPOSITORY = Symbol('AiTokenUsageRepository');
