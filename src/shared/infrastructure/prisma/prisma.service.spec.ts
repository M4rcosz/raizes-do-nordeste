import { describe, expect, it } from '@jest/globals';
import { buildPoolConfig } from './prisma.service';

describe('buildPoolConfig', () => {
  it('connects as-is without TLS when no CA is provided (local dev)', () => {
    const cfg = buildPoolConfig('postgresql://u:p@localhost:5432/db', undefined);

    expect(cfg).toEqual({ connectionString: 'postgresql://u:p@localhost:5432/db' });
    expect(cfg.ssl).toBeUndefined();
  });

  it('verifies against the given CA and strips sslmode from the pool string', () => {
    const cfg = buildPoolConfig(
      'postgresql://u:p@host.pooler.supabase.com:5432/postgres?sslmode=require',
      'CA-PEM',
    );

    expect(cfg.ssl).toEqual({ ca: 'CA-PEM' });
    expect(cfg.connectionString).not.toContain('sslmode');
    expect(cfg.connectionString).toContain('host.pooler.supabase.com:5432');
  });

  it('keeps other query params while removing only sslmode', () => {
    const cfg = buildPoolConfig(
      'postgresql://u:p@host:5432/db?sslmode=require&application_name=raizes',
      'CA',
    );

    expect(cfg.connectionString).toContain('application_name=raizes');
    expect(cfg.connectionString).not.toContain('sslmode');
  });

  it('passes an undefined connection string through untouched', () => {
    expect(buildPoolConfig(undefined, 'CA')).toEqual({ connectionString: undefined });
    expect(buildPoolConfig(undefined, undefined)).toEqual({ connectionString: undefined });
  });
});
