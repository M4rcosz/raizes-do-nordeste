import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Argon2PasswordHasher } from '../modules/identity/infrastructure/security/argon2-password-hasher';

// Idempotent bootstrap of the very first ADMIN. Runs at deploy time (after
// migrate, before the app starts) so a fresh instance is never left without an
// operator. Lives under src/ so nest build (SWC) compiles it into dist/ and it
// runs in the prod image with `node`. It cannot live in prisma/ (not compiled)
// nor reuse ts-node (dev-only, stripped by npm ci --omit=dev).

// Read a required env or fail fast. A missing var stops the boot instead of
// creating a broken, password-less admin.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

const logger = new Logger('BootstrapAdmin');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const username = requireEnv('INITIAL_ADMIN_USERNAME');

  // Existence check first. If the admin is already there we return before
  // touching the password: a re-deploy never re-hashes (argon2 is deliberately
  // slow) and never resets a password the admin may have already changed. Once
  // the account exists the INITIAL_ADMIN_PASSWORD env can even be dropped.
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    logger.log(`Admin already present: ${existing.username} (${existing.id})`);
    return;
  }

  const name = requireEnv('INITIAL_ADMIN_NAME');
  const email = requireEnv('INITIAL_ADMIN_EMAIL');
  const password = requireEnv('INITIAL_ADMIN_PASSWORD');

  // Reuse the real hasher so the stored hash is byte-for-byte what login's
  // argon2.verify expects. Single source of truth for the argon2 params.
  const passwordHash = await new Argon2PasswordHasher().hash(password);

  const admin = await prisma.user.create({
    data: {
      username,
      name,
      email,
      passwordHash,
      role: 'ADMIN',
      // No unit link: ADMIN bypasses the UnitScopeGuard.
    },
  });

  // Never log the password or the hash.
  logger.log(`Admin created: ${admin.username} (${admin.id})`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1; // fail the deploy loudly if bootstrap breaks
  })
  .finally(() => prisma.$disconnect());
