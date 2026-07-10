import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateUserDto } from './create-user-request.dto';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { USERNAME_MAX_LENGTH } from '@modules/identity/domain/value-objects/username';

const validate = (payload: Record<string, unknown>): string[] => {
  const dto = plainToInstance(CreateUserDto, payload);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
};

const valid = {
  name: 'Joao Atendente',
  username: 'joao.atendente',
  password: 'supersecret',
  role: UserRole.ATTENDANT,
};

const usernameErrors = (username: string): string[] => validate({ ...valid, username });

// The privileged create path must enforce the same username rules as the public
// self-register path. Registration is the only other place these rules exist, so a
// gap here would let an admin mint the accounts a customer cannot.
describe('CreateUserDto username rules', () => {
  it('accepts a conventional username', () => {
    expect(usernameErrors('joao.atendente')).toEqual([]);
  });

  it.each(['joao_silva', 'joao-silva', 'joao123', 'j2r'])('accepts %s', (username) => {
    expect(usernameErrors(username)).toEqual([]);
  });

  it('rejects uppercase rather than folding it', () => {
    expect(usernameErrors('Joao.Atendente').length).toBeGreaterThan(0);
  });

  it.each(['.joao', '_joao', '-joao'])('rejects %s: must start alphanumeric', (username) => {
    expect(usernameErrors(username).length).toBeGreaterThan(0);
  });

  it.each(['joao.', 'joao_', 'joao-'])('rejects %s: must end alphanumeric', (username) => {
    expect(usernameErrors(username).length).toBeGreaterThan(0);
  });

  it.each(['me', 'admin', 'support', 'security', 'root', 'null', 'users'])(
    'rejects the reserved name %s',
    (username) => {
      expect(usernameErrors(username)).toContain('username is reserved');
    },
  );

  it('allows a name that merely contains a reserved word', () => {
    expect(usernameErrors('admin.joao')).toEqual([]);
  });

  it('rejects whitespace', () => {
    expect(usernameErrors('joao atendente').length).toBeGreaterThan(0);
  });

  it('rejects a username shorter than the minimum', () => {
    expect(usernameErrors('jo').length).toBeGreaterThan(0);
  });

  it('rejects a username longer than the maximum', () => {
    expect(usernameErrors('a'.repeat(USERNAME_MAX_LENGTH + 1)).length).toBeGreaterThan(0);
  });

  it('rejects a non-ascii homoglyph', () => {
    // Cyrillic "а" (U+0430) renders like Latin "a"; ASCII-only keeps it out.
    expect(usernameErrors('jоao').length).toBeGreaterThan(0);
  });

  it('does not transform the username: admin-create rejects, it never folds', () => {
    const dto = plainToInstance(CreateUserDto, { ...valid, username: 'JOAO' });
    expect(dto.username).toBe('JOAO');
  });
});

describe('CreateUserDto other fields', () => {
  it('requires a role', () => {
    expect(
      validate({ name: valid.name, username: valid.username, password: valid.password }).length,
    ).toBeGreaterThan(0);
  });

  it('rejects a role outside the enum', () => {
    expect(validate({ ...valid, role: 'GOD' }).length).toBeGreaterThan(0);
  });

  it('accepts optional email, phone and businessUnitIds', () => {
    expect(
      validate({
        ...valid,
        email: 'joao@example.com',
        phone: '+5581988888888',
        businessUnitIds: ['3f1e6a5c-0d2b-4c8e-9a7f-1b2c3d4e5f60'],
      }),
    ).toEqual([]);
  });

  it('rejects duplicate businessUnitIds', () => {
    const id = '3f1e6a5c-0d2b-4c8e-9a7f-1b2c3d4e5f60';
    expect(validate({ ...valid, businessUnitIds: [id, id] }).length).toBeGreaterThan(0);
  });

  it('rejects a non-uuid businessUnitId', () => {
    expect(validate({ ...valid, businessUnitIds: ['nope'] }).length).toBeGreaterThan(0);
  });

  it('rejects a password shorter than 8 chars', () => {
    expect(validate({ ...valid, password: 'short' }).length).toBeGreaterThan(0);
  });

  it('rejects an unknown field', () => {
    expect(validate({ ...valid, isActive: true }).length).toBeGreaterThan(0);
  });

  // The controller forwards the body untouched, so this whitelist is the only thing
  // stopping a caller from choosing the new user's primary key. UsersController.create
  // cannot be the guard: it never inspects the body.
  it.each(['id', 'isActive', 'passwordHash', 'createdAt'])(
    'rejects a smuggled %s field rather than forwarding it',
    (field) => {
      expect(validate({ ...valid, [field]: 'attacker-chosen' })).toContain(
        `property ${field} should not exist`,
      );
    },
  );
});
