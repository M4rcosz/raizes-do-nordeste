import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegisterCustomerDto } from './register-customer-request.dto';

const validate = (payload: Record<string, unknown>): string[] => {
  const dto = plainToInstance(RegisterCustomerDto, payload);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
};

const valid = { name: 'Maria Souza', username: 'maria.souza', password: 'supersecret' };

const usernameErrors = (username: string): string[] => validate({ ...valid, username });

describe('RegisterCustomerDto username rules', () => {
  it('accepts a conventional username', () => {
    expect(usernameErrors('maria.souza')).toEqual([]);
  });

  it.each(['maria_souza', 'maria-souza', 'maria123', 'm2r'])('accepts %s', (username) => {
    expect(usernameErrors(username)).toEqual([]);
  });

  it('rejects uppercase rather than folding it', () => {
    expect(usernameErrors('Maria.Souza').length).toBeGreaterThan(0);
  });

  it.each(['.maria', '_maria', '-maria'])('rejects %s: must start alphanumeric', (username) => {
    expect(usernameErrors(username).length).toBeGreaterThan(0);
  });

  it.each(['maria.', 'maria_', 'maria-'])('rejects %s: must end alphanumeric', (username) => {
    expect(usernameErrors(username).length).toBeGreaterThan(0);
  });

  it.each(['...', '---', '___'])('rejects separator-only %s', (username) => {
    expect(usernameErrors(username).length).toBeGreaterThan(0);
  });

  it('still allows separators in the middle, including runs', () => {
    expect(usernameErrors('a..b')).toEqual([]);
  });

  it.each(['me', 'admin', 'support', 'security', 'root', 'null', 'users'])(
    'rejects the reserved name %s',
    (username) => {
      expect(usernameErrors(username)).toContain('username is reserved');
    },
  );

  it('allows a name that merely contains a reserved word', () => {
    expect(usernameErrors('admin.maria')).toEqual([]);
  });

  it('rejects whitespace', () => {
    expect(usernameErrors('maria souza').length).toBeGreaterThan(0);
  });

  it('rejects a username shorter than 3 chars', () => {
    expect(usernameErrors('ma').length).toBeGreaterThan(0);
  });

  it('rejects a username longer than 50 chars', () => {
    expect(usernameErrors('a'.repeat(51)).length).toBeGreaterThan(0);
  });

  it('rejects a non-ascii homoglyph', () => {
    // Cyrillic "а" (U+0430) renders like Latin "a"; ASCII-only keeps it out.
    expect(usernameErrors('mаria').length).toBeGreaterThan(0);
  });

  it('does not transform the username: registration rejects, it never folds', () => {
    const dto = plainToInstance(RegisterCustomerDto, { ...valid, username: 'MARIA' });
    expect(dto.username).toBe('MARIA');
  });
});
