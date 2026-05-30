import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  AuditLogRecord,
  type AuditLogRepository,
} from '@modules/audit/domain/repositories/audit-log.repository';
import { AuditLogInput, AuditLogger } from '../ports/audit-logger.port';

const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'authorization',
  'secret',
  'cpf',
]);

@Injectable()
export class AuditService implements AuditLogger {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly repo: AuditLogRepository,
  ) {}

  async log(input: AuditLogInput): Promise<void> {
    const sanitized: AuditLogRecord = {
      ...input,
      metadata: input.metadata
        ? (this.sanitize(input.metadata) as Record<string, unknown>)
        : undefined,
    };

    try {
      await this.repo.create(sanitized);
    } catch (err) {
      this.logger.error({
        message: 'Failed to persist audit log',
        action: sanitized.action,
        entity: sanitized.entity,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private sanitize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((v) => this.sanitize(v));
    }
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : this.sanitize(val);
      }
      return out;
    }
    return value;
  }
}
