import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SignInDto } from './sign-in-request.dto';
import {
  USERNAME_LOGIN_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
} from '@modules/identity/domain/value-objects/username';

const build = (payload: Record<string, unknown>): SignInDto => plainToInstance(SignInDto, payload);

const validate = (payload: Record<string, unknown>): string[] =>
  validateSync(build(payload), { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );

const valid = { username: 'joao.silva', password: 'supersecret' };

describe('SignInDto', () => {
  it('accepts an already-normalized credential pair', () => {
    expect(validate(valid)).toEqual([]);
  });

  it('lowercases the username so an autocapitalizing keyboard still logs in', () => {
    expect(build({ ...valid, username: 'Joao.Silva' }).username).toBe('joao.silva');
  });

  it('trims the username: citext ignores case but not whitespace', () => {
    expect(build({ ...valid, username: '  joao.silva  ' }).username).toBe('joao.silva');
  });

  it('trims and lowercases together', () => {
    expect(build({ ...valid, username: ' JOAO.SILVA ' }).username).toBe('joao.silva');
  });

  it('leaves a non-string username untouched for @IsString to reject', () => {
    expect(validate({ ...valid, username: 42 }).length).toBeGreaterThan(0);
  });

  it('rejects a username past the safety bound so it cannot bloat the audit log', () => {
    expect(
      validate({ ...valid, username: 'a'.repeat(USERNAME_LOGIN_MAX_LENGTH + 1) }).length,
    ).toBeGreaterThan(0);
  });

  it('accepts a username of exactly the safety bound', () => {
    expect(validate({ ...valid, username: 'a'.repeat(USERNAME_LOGIN_MAX_LENGTH) })).toEqual([]);
  });

  it('does not apply the registration length limit to login', () => {
    // An account created before the 50-char rule (or by bootstrap-admin, or raw SQL)
    // must still authenticate. There is no rename endpoint to recover with.
    expect(validate({ ...valid, username: 'a'.repeat(USERNAME_MAX_LENGTH + 1) })).toEqual([]);
  });

  it('does not apply the registration format rules to login', () => {
    // A legacy account whose name predates the format rules must still sign in.
    expect(validate({ ...valid, username: '.legacy-name.' })).toEqual([]);
  });

  it('rejects a password shorter than 8 chars', () => {
    expect(validate({ ...valid, password: 'short' }).length).toBeGreaterThan(0);
  });
});
