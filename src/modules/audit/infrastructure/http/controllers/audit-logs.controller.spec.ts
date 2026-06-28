import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { AuditLogsController } from './audit-logs.controller';
import { ListAuditLogsUseCase } from '@modules/audit/application/use-cases/list-audit-logs.use-case';
import { AuditLog } from '@modules/audit/domain/entities/audit-log.entity';
import { AuditLogResponseDto } from '../dto/audit-log-response.dto';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';

const buildLog = (id = 'a-1'): AuditLog =>
  new AuditLog(id, 'u-1', 'LOGIN_SUCCESS', 'User', 'u-1', null, new Date('2026-01-01T00:00:00Z'));

describe('AuditLogsController', () => {
  let controller: AuditLogsController;
  let listAuditLogs: jest.Mocked<ListAuditLogsUseCase>;

  beforeAll(async () => {
    listAuditLogs = { execute: jest.fn() } as unknown as jest.Mocked<ListAuditLogsUseCase>;

    const moduleRef = await Test.createTestingModule({
      controllers: [AuditLogsController],
      providers: [{ provide: ListAuditLogsUseCase, useValue: listAuditLogs }],
    }).compile();

    controller = moduleRef.get(AuditLogsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('clamps the limit and returns a paginated DTO envelope', async () => {
    listAuditLogs.execute.mockResolvedValue({
      data: [buildLog()],
      meta: { limit: 100, hasMore: false, nextCursor: null },
    });

    const response = await controller.list({ limit: 99999 });

    expect(listAuditLogs.execute).toHaveBeenCalledWith({
      cursor: undefined,
      limit: 100,
      filters: {},
    });
    expect(response).toBeInstanceOf(PaginatedResponseDto);
    expect(response.data[0]).toBeInstanceOf(AuditLogResponseDto);
    expect(response.data[0].id).toBe('a-1');
  });

  it('forwards the cursor and all filters (from/to as Date) to the use case', async () => {
    listAuditLogs.execute.mockResolvedValue({
      data: [],
      meta: { limit: 20, hasMore: false, nextCursor: null },
    });

    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-01-31T00:00:00Z');

    await controller.list({
      limit: 20,
      cursor: 'cursor-1',
      from,
      to,
      userId: 'u-1',
      action: 'LOGIN_SUCCESS',
      entity: 'User',
      entityId: 'u-1',
    });

    expect(listAuditLogs.execute).toHaveBeenCalledWith({
      cursor: 'cursor-1',
      limit: 20,
      filters: {
        from,
        to,
        userId: 'u-1',
        action: 'LOGIN_SUCCESS',
        entity: 'User',
        entityId: 'u-1',
      },
    });
  });
});
