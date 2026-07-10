import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { IsStrongPassword } from './is-strong-password';

// A minimal host so the decorator can be exercised in isolation, independent of
// the length rules the DTOs stack on top of it.
class Host {
  @IsStrongPassword()
  password!: unknown;
}

const errors = (password: unknown): string[] =>
  validateSync(plainToInstance(Host, { password })).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );

describe('IsStrongPassword', () => {
  it.each(['Aa1!strong', 'Password9', 'lower-UPPER-mix', '123abcDEF'])(
    'accepts %s (3+ character classes)',
    (password) => {
      expect(errors(password)).toEqual([]);
    },
  );

  it.each(['alllowercase', 'ALLUPPERCASE', '1234567890', 'loweronly1'])(
    'rejects %s (fewer than 3 character classes)',
    (password) => {
      expect(errors(password).length).toBeGreaterThan(0);
    },
  );

  it('rejects a non-string value', () => {
    expect(errors(12345678).length).toBeGreaterThan(0);
  });
});
