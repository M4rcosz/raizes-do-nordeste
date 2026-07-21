import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import {
  AiTokenUsageEntry,
  AiTokenUsageRepository,
  AiTokenUsageTotal,
} from '@modules/ai/domain/repositories/ai-token-usage.repository';

/** One appended row plus the tx it was written on, so tests can assert atomicity. */
export interface RecordedUsage extends AiTokenUsageEntry {
  createdAt: Date;
  tx: TransactionContext;
}

/**
 * In-memory AiTokenUsageRepository fake. Append-only, and it keeps the transaction
 * handle each row was written on - that is the property the metering seam must hold
 * (the ledger row shares the debit's transaction).
 */
export class FakeAiTokenUsageRepository implements AiTokenUsageRepository {
  readonly rows: RecordedUsage[] = [];
  /** Overridable clock so period filtering is testable without waiting. */
  now: () => Date = () => new Date();

  record(entry: AiTokenUsageEntry, tx?: TransactionContext): Promise<void> {
    this.rows.push({ ...entry, createdAt: this.now(), tx });
    return Promise.resolve();
  }

  sumByUserInPeriod(userIds: string[], from: Date, to: Date): Promise<AiTokenUsageTotal[]> {
    const totals = new Map<string, number>();
    for (const row of this.rows) {
      if (!userIds.includes(row.userId)) {
        continue;
      }
      if (row.createdAt < from || row.createdAt > to) {
        continue;
      }
      totals.set(row.userId, (totals.get(row.userId) ?? 0) + row.tokensUsed);
    }
    // Users with no spend in the window are absent, exactly like the grouped query.
    return Promise.resolve([...totals].map(([userId, tokensUsed]) => ({ userId, tokensUsed })));
  }
}
