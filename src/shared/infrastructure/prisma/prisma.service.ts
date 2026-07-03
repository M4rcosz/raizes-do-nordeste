import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, PoolConfig } from 'pg';
import { PrismaClient } from '@prisma/client';

// Build the pg Pool config. When a CA cert is provided (a managed DB such as
// Supabase, whose connection pooler presents a self-signed cert in its chain)
// we keep TLS on and verify against that CA. We must strip sslmode from the
// string the Pool parses first: pg merges the parsed connection string AFTER
// the explicit config (connection-parameters.js), so a lingering
// sslmode=require would override our ssl object and force verify-full against
// the system CA store, which is exactly what rejects the self-signed chain.
// The native migrate engine still reads the untouched process.env.DATABASE_URL.
// With no CA (local dev, plain postgres) we connect as-is, without TLS.
export function buildPoolConfig(
  databaseUrl: string | undefined,
  caCert: string | undefined,
): PoolConfig {
  if (caCert === undefined || databaseUrl === undefined) {
    return { connectionString: databaseUrl };
  }

  const url = new URL(databaseUrl);
  url.searchParams.delete('sslmode');
  return { connectionString: url.toString(), ssl: { ca: caCert } };
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const pool = new Pool(buildPoolConfig(process.env.DATABASE_URL, process.env.DATABASE_CA_CERT));
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
