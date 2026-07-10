import { isEmail } from 'class-validator';
import { usernameRejectionReason } from '../modules/identity/domain/value-objects/username';
import { passwordRejectionReason } from '../modules/identity/domain/value-objects/password-policy';
import {
  EMAIL_MAX_LENGTH,
  normalizeEmail,
} from '../modules/identity/domain/value-objects/email-normalization';

/**
 * Idempotent bootstrap of the very first ADMIN, expressed against ports so it can be
 * tested without a database. The entrypoint (bootstrap-admin.ts) supplies the real
 * Prisma client, hasher and logger.
 */
export interface AdminRecord {
  id: string;
  username: string;
}

export interface BootstrapAdminDeps {
  env: Record<string, string | undefined>;
  findByUsername(username: string): Promise<AdminRecord | null>;
  createAdmin(input: {
    username: string;
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<AdminRecord>;
  hashPassword(plain: string): Promise<string>;
  log(message: string): void;
}

// Read a required env or fail fast. A missing var stops the boot instead of
// creating a broken, password-less admin.
export function requireEnv(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

export async function bootstrapAdmin(deps: BootstrapAdminDeps): Promise<void> {
  const username = requireEnv(deps.env, 'INITIAL_ADMIN_USERNAME');

  // This path writes straight to Prisma, so it skips the DTO decorators that guard
  // every other write. Apply the same rules here or the one account a fresh deploy is
  // guaranteed to have could be a reserved name, or too long for the login border to
  // accept - locking the operator out with no rename endpoint.
  const rejection = usernameRejectionReason(username);
  if (rejection) {
    throw new Error(`Invalid INITIAL_ADMIN_USERNAME: ${rejection}`);
  }

  // Existence check first. If the admin is already there we return before touching the
  // password: a re-deploy never re-hashes (argon2 is deliberately slow) and never resets
  // a password the admin may have changed. Once the account exists the
  // INITIAL_ADMIN_PASSWORD env can even be dropped.
  const existing = await deps.findByUsername(username);
  if (existing) {
    deps.log(`Admin already present: ${existing.username} (${existing.id})`);
    return;
  }

  const name = requireEnv(deps.env, 'INITIAL_ADMIN_NAME');

  // Same rules the DTOs apply, re-applied here because this path skips them. Without
  // it the one account a fresh deploy is guaranteed to have (an ADMIN) could be born
  // with a weaker password or a malformed email than any account the API accepts.
  const email = normalizeEmail(requireEnv(deps.env, 'INITIAL_ADMIN_EMAIL'));
  if (email.length > EMAIL_MAX_LENGTH || !isEmail(email)) {
    throw new Error('Invalid INITIAL_ADMIN_EMAIL: must be a valid email address');
  }

  const password = requireEnv(deps.env, 'INITIAL_ADMIN_PASSWORD');
  const passwordRejection = passwordRejectionReason(password);
  if (passwordRejection) {
    throw new Error(`Invalid INITIAL_ADMIN_PASSWORD: ${passwordRejection}`);
  }

  // Reuse the real hasher so the stored hash is byte-for-byte what login's
  // argon2.verify expects. Single source of truth for the argon2 params.
  const passwordHash = await deps.hashPassword(password);

  const admin = await deps.createAdmin({ username, name, email, passwordHash });

  // Never log the password or the hash.
  deps.log(`Admin created: ${admin.username} (${admin.id})`);
}
