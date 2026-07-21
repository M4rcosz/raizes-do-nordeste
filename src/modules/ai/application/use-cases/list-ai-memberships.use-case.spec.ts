import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AiMembership } from '@modules/ai/domain/entities/ai-membership.entity';
import { AiMembershipFetchError } from '../errors/ai-membership-fetch.error';
import { InvalidUsagePeriodError } from '../errors/invalid-usage-period.error';
import { InvalidAiCursorError } from '../errors/invalid-ai-cursor.error';
import { decodeAiKeysetCursor } from '../ai-keyset-cursor';
import { ListAiMembershipsUseCase } from './list-ai-memberships.use-case';
import { FakeAiMembershipRepository } from './__fakes__/ai-membership-repository.fake';
import { FakeAiTokenUsageRepository } from './__fakes__/ai-token-usage-repository.fake';
import { FakeUserDirectory } from './__fakes__/user-directory.fake';

const FROM = new Date('2026-01-01T00:00:00.000Z');
const TO = new Date('2026-01-31T00:00:00.000Z');

// Distinct creation instants so the (createdAt desc, id desc) order is unambiguous.
const CREATED = (day: number): Date => new Date(`2026-01-0${day}T00:00:00.000Z`);

function membership(userId: string, createdAt: Date): AiMembership {
  return new AiMembership(`ai-${userId}`, userId, 1000, createdAt, createdAt);
}

describe('ListAiMembershipsUseCase', () => {
  let memberships: FakeAiMembershipRepository;
  let usage: FakeAiTokenUsageRepository;
  let directory: FakeUserDirectory;
  let useCase: ListAiMembershipsUseCase;

  // user-3 is the newest, so it leads the listing.
  const seedThree = (): void => {
    memberships.seed(membership('user-1', CREATED(1)));
    memberships.seed(membership('user-2', CREATED(2)));
    memberships.seed(membership('user-3', CREATED(3)));
    directory.seed({ id: 'user-1', name: 'Ana', email: null });
    directory.seed({ id: 'user-2', name: 'Bruno', email: null });
    directory.seed({ id: 'user-3', name: 'Carla', email: null });
  };

  beforeEach(() => {
    memberships = new FakeAiMembershipRepository();
    usage = new FakeAiTokenUsageRepository();
    directory = new FakeUserDirectory();
    useCase = new ListAiMembershipsUseCase(memberships, usage, directory);
  });

  it('merges balance, period spend and identity per membership', async () => {
    memberships.seed(membership('user-1', FROM));
    directory.seed({ id: 'user-1', name: 'Ana Souza', email: 'ana@example.com' });
    usage.now = (): Date => new Date('2026-01-10T00:00:00.000Z');
    await usage.record({ userId: 'user-1', conversationId: 'conv-1', tokensUsed: 40 });
    await usage.record({ userId: 'user-1', conversationId: 'conv-1', tokensUsed: 2 });

    const result = await useCase.execute({ from: FROM, to: TO, limit: 20 });

    expect(result.page.data).toHaveLength(1);
    expect(result.page.data[0]?.membership.tokenBalance).toBe(1000);
    expect(result.page.data[0]?.tokensUsedInPeriod).toBe(42);
    expect(result.page.data[0]?.user).toEqual({
      id: 'user-1',
      name: 'Ana Souza',
      email: 'ana@example.com',
    });
  });

  it('reports zero for a member who spent nothing in the window', async () => {
    memberships.seed(membership('user-1', FROM));
    directory.seed({ id: 'user-1', name: 'Ana Souza', email: null });

    const result = await useCase.execute({ from: FROM, to: TO, limit: 20 });

    expect(result.page.data[0]?.tokensUsedInPeriod).toBe(0);
  });

  it('excludes spend outside the window', async () => {
    memberships.seed(membership('user-1', FROM));
    directory.seed({ id: 'user-1', name: 'Ana Souza', email: null });
    usage.now = (): Date => new Date('2026-02-15T00:00:00.000Z');
    await usage.record({ userId: 'user-1', conversationId: null, tokensUsed: 99 });

    const result = await useCase.execute({ from: FROM, to: TO, limit: 20 });

    expect(result.page.data[0]?.tokensUsedInPeriod).toBe(0);
  });

  it('resolves every identity in one batched lookup', async () => {
    // The N+1 this port exists to prevent: a bigger page must not mean more queries.
    seedThree();

    const result = await useCase.execute({ from: FROM, to: TO, limit: 20 });

    expect(result.page.data).toHaveLength(3);
    expect(directory.calls).toHaveLength(1);
    // Newest first, so the ids come back in reverse creation order.
    expect(directory.calls[0]).toEqual(['user-3', 'user-2', 'user-1']);
  });

  it('keeps the membership when the user record cannot be resolved', async () => {
    memberships.seed(membership('ghost', FROM));

    const result = await useCase.execute({ from: FROM, to: TO, limit: 20 });

    expect(result.page.data[0]?.user).toBeNull();
    expect(result.page.data[0]?.membership.userId).toBe('ghost');
  });

  it('includes revoked memberships', async () => {
    memberships.seed(new AiMembership('ai-1', 'user-1', 1000, FROM, FROM, new Date()));
    directory.seed({ id: 'user-1', name: 'Ana', email: null });

    const result = await useCase.execute({ from: FROM, to: TO, limit: 20 });

    // A revoked wallet keeps the tokens it already burned; hiding it under-reports.
    expect(result.page.data[0]?.membership.isRevoked).toBe(true);
  });

  it('defaults to the last 30 days and echoes the window back', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-31T00:00:00.000Z'));
    try {
      const result = await useCase.execute({ limit: 20 });

      expect(result.periodTo).toEqual(new Date('2026-03-31T00:00:00.000Z'));
      expect(result.periodFrom).toEqual(new Date('2026-03-01T00:00:00.000Z'));
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects an inverted window instead of reporting an empty one', async () => {
    // Answering it would render as "nobody spent anything", which is a lie.
    await expect(useCase.execute({ from: TO, to: FROM, limit: 20 })).rejects.toBeInstanceOf(
      InvalidUsagePeriodError,
    );
  });

  it('wraps a persistence failure as a fetch error', async () => {
    const boom = new Error('connection lost');
    jest.spyOn(memberships, 'listAll').mockRejectedValueOnce(boom);

    const error = await useCase.execute({ from: FROM, to: TO, limit: 20 }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiMembershipFetchError);
    expect((error as AiMembershipFetchError).cause).toBe(boom);
  });

  it('returns an empty report when nobody is enrolled', async () => {
    const result = await useCase.execute({ from: FROM, to: TO, limit: 20 });

    expect(result.page.data).toEqual([]);
  });

  describe('pagination', () => {
    it('cuts the page at the limit and hands back a usable cursor', async () => {
      seedThree();

      const result = await useCase.execute({ from: FROM, to: TO, limit: 2 });

      expect(result.page.data.map((i) => i.membership.userId)).toEqual(['user-3', 'user-2']);
      expect(result.page.meta.hasMore).toBe(true);
      expect(decodeAiKeysetCursor(result.page.meta.nextCursor!)).toEqual({
        timestamp: CREATED(2).toISOString(),
        id: 'ai-user-2',
      });
    });

    it('following the cursor yields the next page with no duplicate and no gap', async () => {
      seedThree();

      const first = await useCase.execute({ from: FROM, to: TO, limit: 2 });
      const second = await useCase.execute({
        from: FROM,
        to: TO,
        limit: 2,
        cursor: first.page.meta.nextCursor!,
      });

      expect(second.page.data.map((i) => i.membership.userId)).toEqual(['user-1']);
      expect(second.page.meta.hasMore).toBe(false);
      expect(second.page.meta.nextCursor).toBeNull();
      expect([...first.page.data, ...second.page.data].map((i) => i.membership.userId)).toEqual([
        'user-3',
        'user-2',
        'user-1',
      ]);
    });

    it('aggregates spend and identity over the PAGE, not the whole table', async () => {
      // The enrichment queries carry an IN (...) list. Building it from anything but
      // the trimmed page turns a paginated report back into a full-table read - and
      // would also leak the probe row's user into the lookup.
      seedThree();
      const sumByUser = jest.spyOn(usage, 'sumByUserInPeriod');

      await useCase.execute({ from: FROM, to: TO, limit: 2 });

      expect(sumByUser.mock.calls[0]?.[0]).toEqual(['user-3', 'user-2']);
      expect(directory.calls[0]).toEqual(['user-3', 'user-2']);
    });

    it('rejects a malformed cursor as invalid input, not as a fetch outage', async () => {
      const error = await useCase
        .execute({ from: FROM, to: TO, limit: 20, cursor: 'not-a-real-token' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InvalidAiCursorError);
      expect(error).not.toBeInstanceOf(AiMembershipFetchError);
    });

    it('never reaches the repository when the cursor is malformed', async () => {
      const listAll = jest.spyOn(memberships, 'listAll');

      await useCase
        .execute({ from: FROM, to: TO, limit: 20, cursor: '!!!' })
        .catch(() => undefined);

      expect(listAll).not.toHaveBeenCalled();
    });
  });
});
