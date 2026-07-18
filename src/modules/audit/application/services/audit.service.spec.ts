import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { AuditService } from './audit.service';
import {
  AUDIT_LOG_REPOSITORY,
  AuditLogRepository,
} from '@modules/audit/domain/repositories/audit-log.repository';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';

describe('AuditService', () => {
  let service: AuditService;
  let create: jest.MockedFunction<AuditLogRepository['create']>;

  beforeAll(async () => {
    create = jest.fn() as jest.MockedFunction<AuditLogRepository['create']>;
    const repo: jest.Mocked<AuditLogRepository> = { create };

    const moduleRef = await Test.createTestingModule({
      providers: [AuditService, { provide: AUDIT_LOG_REPOSITORY, useValue: repo }],
    }).compile();

    service = moduleRef.get(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should forward a clean record straight to the repository', async () => {
    await service.log({
      userId: 'user-1',
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      entity: 'User',
      entityId: 'user-1',
      metadata: { username: 'panic' },
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      userId: 'user-1',
      action: 'LOGIN_SUCCESS',
      entity: 'User',
      entityId: 'user-1',
      metadata: { username: 'panic' },
    });
  });

  it('should keep userId nullable for unauthenticated attempts', async () => {
    await service.log({
      userId: null,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entity: 'User',
      entityId: null,
      metadata: { username: 'ghost' },
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ userId: null, entityId: null }));
  });

  describe('metadata sanitization (DoD: no password/token/cpf leaks)', () => {
    it('should redact password, token, and cpf at the top level', async () => {
      await service.log({
        userId: 'user-1',
        action: AUDIT_ACTIONS.LOGIN_SUCCESS,
        entity: 'User',
        entityId: 'user-1',
        metadata: {
          username: 'panic',
          password: 'super-secret',
          token: 'jwt.eyJ.xyz',
          cpf: '123.456.789-00',
        },
      });

      const persisted = create.mock.calls[0]?.[0];
      expect(persisted.metadata).toEqual({
        username: 'panic',
        password: '[REDACTED]',
        token: '[REDACTED]',
        cpf: '[REDACTED]',
      });
    });

    it('should redact phone and email (PII defense-in-depth)', async () => {
      await service.log({
        userId: 'user-1',
        action: AUDIT_ACTIONS.USER_UPDATED,
        entity: 'User',
        entityId: 'user-1',
        metadata: {
          // 'name' is deliberately not used as the control field here: it is itself
          // a sensitive key (see the redaction test below), so it would not prove
          // selective (non-blanket) redaction.
          updatedFields: ['phone'],
          phone: '+5581999999999',
          email: 'maria@example.com',
          notes: 'requested via support ticket',
        },
      });

      const persisted = create.mock.calls[0]?.[0];
      expect(persisted.metadata).toEqual({
        updatedFields: ['phone'],
        phone: '[REDACTED]',
        email: '[REDACTED]',
        notes: 'requested via support ticket',
      });
    });

    it('should redact name-ish keys (LGPD guardrail for guest customer names)', async () => {
      await service.log({
        userId: 'user-1',
        action: AUDIT_ACTIONS.ORDER_CREATED,
        entity: 'Order',
        entityId: 'order-1',
        metadata: {
          orderChannel: 'TOTEM',
          customerName: 'Maria',
          fullName: 'Maria Souza',
          name: 'Maria',
        },
      });

      const persisted = create.mock.calls[0]?.[0];
      expect(persisted.metadata).toEqual({
        orderChannel: 'TOTEM',
        customerName: '[REDACTED]',
        fullName: '[REDACTED]',
        name: '[REDACTED]',
      });
    });

    it('should redact sensitive keys regardless of casing', async () => {
      await service.log({
        userId: null,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entity: 'User',
        entityId: null,
        metadata: {
          Password: 'x',
          ACCESS_TOKEN: 'y',
          Authorization: 'Bearer abc',
          Secret: 'z',
        },
      });

      const persisted = create.mock.calls[0]?.[0];
      expect(persisted.metadata).toEqual({
        Password: '[REDACTED]',
        ACCESS_TOKEN: '[REDACTED]',
        Authorization: '[REDACTED]',
        Secret: '[REDACTED]',
      });
    });

    it('should redact sensitive keys nested inside objects and arrays', async () => {
      await service.log({
        userId: 'user-1',
        action: AUDIT_ACTIONS.LOGIN_SUCCESS,
        entity: 'User',
        entityId: 'user-1',
        metadata: {
          payload: { credentials: { password: 'p', token: 't' }, cpf: '111' },
          attempts: [{ password: 'a' }, { ok: true }],
        },
      });

      const persisted = create.mock.calls[0]?.[0];
      expect(persisted.metadata).toEqual({
        payload: {
          credentials: { password: '[REDACTED]', token: '[REDACTED]' },
          cpf: '[REDACTED]',
        },
        attempts: [{ password: '[REDACTED]' }, { ok: true }],
      });
    });

    it('should not mutate the caller-provided metadata object', async () => {
      const metadata = { username: 'panic', password: 'secret' };

      await service.log({
        userId: 'user-1',
        action: AUDIT_ACTIONS.LOGIN_SUCCESS,
        entity: 'User',
        entityId: 'user-1',
        metadata,
      });

      expect(metadata.password).toBe('secret');
    });

    it('should pass undefined metadata through unchanged', async () => {
      await service.log({
        userId: 'user-1',
        action: AUDIT_ACTIONS.LOGIN_SUCCESS,
        entity: 'User',
        entityId: 'user-1',
      });

      expect(create).toHaveBeenCalledWith(expect.objectContaining({ metadata: undefined }));
    });
  });

  describe('resilience', () => {
    it('should swallow repository errors so audit failures never break callers', async () => {
      create.mockRejectedValue(new Error('audit DB down'));

      await expect(
        service.log({
          userId: 'user-1',
          action: AUDIT_ACTIONS.LOGIN_SUCCESS,
          entity: 'User',
          entityId: 'user-1',
          metadata: { username: 'panic' },
        }),
      ).resolves.toBeUndefined();
    });
  });
});
