import { Inject, Injectable } from '@nestjs/common';
import { buildCursorPage, type CursorPaginatedResult } from '@shared/pagination/pagination';
import {
  USER_DIRECTORY,
  type UserDirectory,
  type UserDirectoryEntry,
} from '@modules/identity/application/ports/user-directory.port';
import { AiMembership } from '../../domain/entities/ai-membership.entity';
import {
  AI_MEMBERSHIP_REPOSITORY,
  type AiMembershipKeyset,
  type AiMembershipRepository,
} from '../../domain/repositories/ai-membership.repository';
import {
  AI_TOKEN_USAGE_REPOSITORY,
  type AiTokenUsageRepository,
} from '../../domain/repositories/ai-token-usage.repository';
import { AiMembershipFetchError } from '../errors/ai-membership-fetch.error';
import { InvalidUsagePeriodError } from '../errors/invalid-usage-period.error';
import { decodeAiKeysetCursor, encodeAiKeysetCursor } from '../ai-keyset-cursor';

export interface ListAiMembershipsInput {
  from?: Date;
  to?: Date;
  cursor?: string;
  limit: number;
}

export interface AiMembershipUsage {
  membership: AiMembership;
  /** Tokens spent inside the reported window. Zero when the user spent nothing. */
  tokensUsedInPeriod: number;
  /** Null when the account is gone but its membership row survived it. */
  user: UserDirectoryEntry | null;
}

export interface ListAiMembershipsResult {
  /** Echoed back so the caller knows which window the totals cover. */
  periodFrom: Date;
  periodTo: Date;
  page: CursorPaginatedResult<AiMembershipUsage>;
}

// Default reporting window when the caller gives no dates: the last 30 days. Picked
// to match how the report is read in practice ("who is burning tokens lately") and
// to keep an unbounded all-time scan off the default path.
const DEFAULT_PERIOD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Admin report: one page of AI memberships with balance, spend over a window, and who
 * the user is. Three queries per page regardless of page size - the spend aggregate
 * and the identity lookup are both batched, and both run over the PAGE only.
 */
@Injectable()
export class ListAiMembershipsUseCase {
  constructor(
    @Inject(AI_MEMBERSHIP_REPOSITORY)
    private readonly memberships: AiMembershipRepository,
    @Inject(AI_TOKEN_USAGE_REPOSITORY)
    private readonly usage: AiTokenUsageRepository,
    @Inject(USER_DIRECTORY)
    private readonly directory: UserDirectory,
  ) {}

  async execute(input: ListAiMembershipsInput): Promise<ListAiMembershipsResult> {
    const { from, to } = ListAiMembershipsUseCase.resolvePeriod(input);
    const { cursor, limit } = input;

    // Decode before the fetch: a malformed token is the caller's error (422), not a
    // repository failure, and must not surface as an outage.
    const keyset = cursor === undefined ? undefined : this.toKeyset(cursor);

    let page: CursorPaginatedResult<AiMembership>;
    let totals: Map<string, number>;
    let users: Map<string, UserDirectoryEntry>;
    try {
      // Over-fetch by one to detect a next page, then cut the page BEFORE enriching:
      // the aggregate and the directory lookup must run over the page, not over the
      // table (and not over the probe row either).
      const items = await this.memberships.listAll({ take: limit + 1, keyset });
      page = buildCursorPage(items, limit, (membership) =>
        encodeAiKeysetCursor(membership.createdAt, membership.id),
      );
      const userIds = page.data.map((m) => m.userId);
      // Both lookups are per-page, not per-row: the whole point of listing this way
      // is that a bigger page never means more queries.
      const [usageTotals, directoryEntries] = await Promise.all([
        this.usage.sumByUserInPeriod(userIds, from, to),
        this.directory.findByIds(userIds),
      ]);
      totals = new Map(usageTotals.map((t) => [t.userId, t.tokensUsed]));
      users = new Map(directoryEntries.map((u) => [u.id, u]));
    } catch (err) {
      throw new AiMembershipFetchError('Could not retrieve AI memberships.', { cause: err });
    }

    return {
      periodFrom: from,
      periodTo: to,
      page: {
        data: page.data.map((membership) => ({
          membership,
          // Absent from the aggregate means no spend in the window, not unknown.
          tokensUsedInPeriod: totals.get(membership.userId) ?? 0,
          user: users.get(membership.userId) ?? null,
        })),
        meta: page.meta,
      },
    };
  }

  private toKeyset(cursor: string): AiMembershipKeyset {
    const decoded = decodeAiKeysetCursor(cursor);
    return { createdAt: new Date(decoded.timestamp), id: decoded.id };
  }

  private static resolvePeriod(input: ListAiMembershipsInput): { from: Date; to: Date } {
    const to = input.to ?? new Date();
    const from = input.from ?? new Date(to.getTime() - DEFAULT_PERIOD_DAYS * DAY_MS);
    // An inverted window would aggregate to zero everywhere and read as "nobody
    // spent anything", so it is rejected rather than answered.
    if (from > to) {
      throw new InvalidUsagePeriodError('The period start must not be after the period end.');
    }
    return { from, to };
  }
}
