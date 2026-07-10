import { describe, expect, it } from '@jest/globals';
import {
  hasEnoughCharacterClasses,
  passwordRejectionReason,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './password-policy';

describe('hasEnoughCharacterClasses', () => {
  it.each(['Aa1!strong', 'Password9', 'lower-UPPER-mix', '123abcDEF'])(
    'accepts %s (3+ classes)',
    (value) => {
      expect(hasEnoughCharacterClasses(value)).toBe(true);
    },
  );

  it.each(['alllowercase', 'ALLUPPERCASE', '1234567890', 'loweronly1'])(
    'rejects %s (fewer than 3 classes)',
    (value) => {
      expect(hasEnoughCharacterClasses(value)).toBe(false);
    },
  );
});

describe('passwordRejectionReason', () => {
  it('accepts a strong password of sufficient length', () => {
    expect(passwordRejectionReason('Sup3r!Secret')).toBeNull();
  });

  it('rejects a password shorter than the minimum', () => {
    expect(passwordRejectionReason('Aa1!x')).toContain(`at least ${PASSWORD_MIN_LENGTH}`);
  });

  it('rejects a password past the argon2 cap', () => {
    expect(passwordRejectionReason(`Aa1!${'x'.repeat(PASSWORD_MAX_LENGTH)}`)).toContain(
      `at most ${PASSWORD_MAX_LENGTH}`,
    );
  });

  it('rejects a long-but-simple password lacking variety', () => {
    expect(passwordRejectionReason('alllowercaseletters')).not.toBeNull();
  });
});
