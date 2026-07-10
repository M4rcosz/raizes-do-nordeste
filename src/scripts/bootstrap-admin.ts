import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Argon2PasswordHasher } from '../modules/identity/infrastructure/security/argon2-password-hasher';
import { bootstrapAdmin } from './bootstrap-admin.core';

// Process entrypoint for the idempotent first-ADMIN bootstrap. Runs at deploy time
// (after migrate, before the app starts) so a fresh instance is never left without an
// operator. Lives under src/ so nest build (SWC) compiles it into dist/ and it runs in
// the prod image with `node`. It cannot live in prisma/ (not compiled) nor reuse
// ts-node (dev-only, stripped by npm ci --omit=dev).
//
// Wiring only. The logic - and its tests - live in bootstrap-admin.core.ts.

const logger = new Logger('BootstrapAdmin');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const hasher = new Argon2PasswordHasher();

bootstrapAdmin({
  env: process.env,
  findByUsername: (username) => prisma.user.findUnique({ where: { username } }),
  createAdmin: (data) =>
    prisma.user.create({
      // No unit link: ADMIN bypasses the UnitScopeGuard.
      data: { ...data, role: 'ADMIN' },
    }),
  hashPassword: (plain) => hasher.hash(plain),
  log: (message) => logger.log(message),
})
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1; // fail the deploy loudly if bootstrap breaks
  })
  .finally(() => prisma.$disconnect());
