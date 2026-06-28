import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_KINDS } from '@shared/errors/errors.type';
import { ListAuditLogsUseCase } from './list-audit-logs.use-case';
import { AuditLogsFetchError } from '../errors/audit-logs-fetch.error';
import { InvalidAuditLogWindowError } from '../errors/invalid-audit-log-window.error';
import { AuditLog } from '../../domain/entities/audit-log.entity';
import type {
  AuditLogRecord,
  AuditLogRepository,
  FindAuditLogsInput,
} from '../../domain/repositories/audit-log.repository';

const makeLog = (id: string): AuditLog =>
  new AuditLog(id, 'u-1', 'LOGIN_SUCCESS', 'User', 'u-1', null, new Date('2026-01-01T00:00:00Z'));

// Fake repo: records the last findMany call and replays a configured result or failure.
class FakeAuditLogRepository implements AuditLogRepository {
  public lastFindManyInput?: FindAuditLogsInput;
  public result: AuditLog[] = [];
  public failure?: Error;

  create(_record: AuditLogRecord): Promise<void> {
    return Promise.resolve();
  }

  findMany(input: FindAuditLogsInput): Promise<AuditLog[]> {
    this.lastFindManyInput = input;
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    return Promise.resolve(this.result);
  }
}

describe('ListAuditLogsUseCase', () => {
  let repo: FakeAuditLogRepository;
  let useCase: ListAuditLogsUseCase;

  beforeEach(() => {
    repo = new FakeAuditLogRepository();
    useCase = new ListAuditLogsUseCase(repo);
  });

  it('fetches limit+1 rows and forwards all filters to the repository', async () => {
    repo.result = [makeLog('a-1')];
    const filters = {
      from: new Date('2026-01-01T00:00:00Z'),
      to: new Date('2026-01-31T00:00:00Z'),
      userId: 'u-1',
      action: 'LOGIN_SUCCESS',
      entity: 'User',
      entityId: 'u-1',
    };

    await useCase.execute({ limit: 10, cursor: 'cursor-1', filters });

    expect(repo.lastFindManyInput).toEqual({
      filters,
      pagination: { cursor: 'cursor-1', take: 11 },
    });
  });

  it('trims the extra row and reports hasMore + nextCursor when a full page is returned', async () => {
    repo.result = [makeLog('a-1'), makeLog('a-2'), makeLog('a-3')];

    const result = await useCase.execute({ limit: 2 });

    expect(result.data).toHaveLength(2);
    expect(result.meta.hasMore).toBe(true);
    expect(result.meta.nextCursor).toBe('a-2');
  });

  it('reports no more pages when fewer than limit+1 rows come back', async () => {
    repo.result = [makeLog('a-1')];

    const result = await useCase.execute({ limit: 2 });

    expect(result.data).toHaveLength(1);
    expect(result.meta.hasMore).toBe(false);
    expect(result.meta.nextCursor).toBeNull();
  });

  it('rejects an inverted window with InvalidAuditLogWindowError and never hits the repo', async () => {
    const promise = useCase.execute({
      limit: 10,
      filters: {
        from: new Date('2026-02-01T00:00:00Z'),
        to: new Date('2026-01-01T00:00:00Z'),
      },
    });

    await expect(promise).rejects.toBeInstanceOf(InvalidAuditLogWindowError);
    await expect(promise).rejects.toMatchObject({ kind: ERROR_KINDS.INVALID });

    expect(repo.lastFindManyInput).toBeUndefined();
  });

  it('wraps repository failures in AuditLogsFetchError', async () => {
    repo.failure = new Error('db down');

    await expect(useCase.execute({ limit: 10 })).rejects.toBeInstanceOf(AuditLogsFetchError);
  });
});
