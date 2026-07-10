import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  AdminRecord,
  BootstrapAdminDeps,
  bootstrapAdmin,
  requireEnv,
} from './bootstrap-admin.core';

const ADMIN: AdminRecord = { id: 'u-1', username: 'operator' };

const VALID_ENV = {
  INITIAL_ADMIN_USERNAME: 'operator',
  INITIAL_ADMIN_NAME: 'Operator',
  INITIAL_ADMIN_EMAIL: 'ops@example.com',
  INITIAL_ADMIN_PASSWORD: 'supersecret',
};

type Deps = {
  [K in keyof BootstrapAdminDeps]: BootstrapAdminDeps[K] extends (...args: infer A) => infer R
    ? jest.MockedFunction<(...args: A) => R>
    : BootstrapAdminDeps[K];
};

const buildDeps = (env: Record<string, string | undefined> = VALID_ENV): Deps => ({
  env,
  findByUsername: jest.fn<BootstrapAdminDeps['findByUsername']>().mockResolvedValue(null),
  createAdmin: jest.fn<BootstrapAdminDeps['createAdmin']>().mockResolvedValue(ADMIN),
  hashPassword: jest.fn<BootstrapAdminDeps['hashPassword']>().mockResolvedValue('argon2-hash'),
  log: jest.fn<BootstrapAdminDeps['log']>(),
});

describe('requireEnv', () => {
  it('returns a present value', () => {
    expect(requireEnv({ A: 'x' }, 'A')).toBe('x');
  });

  // A missing var must stop the boot rather than create a password-less admin.
  it.each([undefined, ''])('throws when the var is %p, naming it', (value) => {
    expect(() => requireEnv({ A: value }, 'A')).toThrow('Missing required env A');
  });
});

describe('bootstrapAdmin', () => {
  let deps: Deps;

  beforeEach(() => {
    deps = buildDeps();
  });

  it('creates the admin when none exists', async () => {
    await bootstrapAdmin(deps);

    expect(deps.hashPassword).toHaveBeenCalledWith('supersecret');
    expect(deps.createAdmin).toHaveBeenCalledWith({
      username: 'operator',
      name: 'Operator',
      email: 'ops@example.com',
      passwordHash: 'argon2-hash',
    });
  });

  // argon2 is deliberately slow, and the admin may have rotated the password since.
  it('is idempotent: an existing admin is never re-hashed or overwritten', async () => {
    deps.findByUsername.mockResolvedValue(ADMIN);

    await bootstrapAdmin(deps);

    expect(deps.hashPassword).not.toHaveBeenCalled();
    expect(deps.createAdmin).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('Admin already present: operator (u-1)');
  });

  it('does not read the password env when the admin already exists', async () => {
    deps = buildDeps({ INITIAL_ADMIN_USERNAME: 'operator' });
    deps.findByUsername.mockResolvedValue(ADMIN);

    // No INITIAL_ADMIN_PASSWORD in env, and that must not be an error on re-deploy.
    await expect(bootstrapAdmin(deps)).resolves.toBeUndefined();
  });

  // This path skips the DTO decorators, so the username rules have to be re-applied
  // here. A reserved or over-long name would lock the operator out: there is no
  // rename endpoint.
  it.each([
    ['admin', 'reserved'],
    ['me', 'reserved'],
    ['.operator', 'must start alphanumeric'],
    ['operator.', 'must end alphanumeric'],
    ['op', 'too short'],
    ['Operator', 'uppercase'],
  ])('rejects %s (%s) before touching the database', async (username) => {
    deps = buildDeps({ ...VALID_ENV, INITIAL_ADMIN_USERNAME: username });

    await expect(bootstrapAdmin(deps)).rejects.toThrow(/Invalid INITIAL_ADMIN_USERNAME/);
    expect(deps.findByUsername).not.toHaveBeenCalled();
    expect(deps.createAdmin).not.toHaveBeenCalled();
  });

  it.each(['INITIAL_ADMIN_NAME', 'INITIAL_ADMIN_EMAIL', 'INITIAL_ADMIN_PASSWORD'])(
    'fails fast when %s is missing, without creating a partial admin',
    async (missing) => {
      deps = buildDeps({ ...VALID_ENV, [missing]: undefined });

      await expect(bootstrapAdmin(deps)).rejects.toThrow(`Missing required env ${missing}`);
      expect(deps.createAdmin).not.toHaveBeenCalled();
    },
  );

  it('fails fast when the username env is missing, before any lookup', async () => {
    deps = buildDeps({});

    await expect(bootstrapAdmin(deps)).rejects.toThrow(
      'Missing required env INITIAL_ADMIN_USERNAME',
    );
    expect(deps.findByUsername).not.toHaveBeenCalled();
  });

  it('never logs the password or the hash', async () => {
    await bootstrapAdmin(deps);

    const logged = deps.log.mock.calls.flat().join(' ');
    expect(logged).not.toContain('supersecret');
    expect(logged).not.toContain('argon2-hash');
    expect(logged).toBe('Admin created: operator (u-1)');
  });
});
