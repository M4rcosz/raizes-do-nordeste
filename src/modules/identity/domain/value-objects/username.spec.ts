import { describe, expect, it } from '@jest/globals';
import {
  RESERVED_USERNAME_MESSAGE,
  USERNAME_MAX_LENGTH,
  usernameRejectionReason,
} from './username';

describe('usernameRejectionReason', () => {
  it('accepts a conventional username', () => {
    expect(usernameRejectionReason('joao.silva')).toBeNull();
  });

  it('rejects a reserved name', () => {
    expect(usernameRejectionReason('admin')).toBe(RESERVED_USERNAME_MESSAGE);
  });

  it('rejects uppercase', () => {
    expect(usernameRejectionReason('Joao')).not.toBeNull();
  });

  it.each(['.joao', 'joao.', '-joao', 'joao-'])(
    'rejects %s: must start and end alphanumeric',
    (username) => {
      expect(usernameRejectionReason(username)).not.toBeNull();
    },
  );

  it('rejects a name shorter than the minimum', () => {
    expect(usernameRejectionReason('ab')).not.toBeNull();
  });

  it('rejects a name longer than the maximum', () => {
    expect(usernameRejectionReason('a'.repeat(USERNAME_MAX_LENGTH + 1))).not.toBeNull();
  });

  it('accepts a name of exactly the maximum', () => {
    expect(usernameRejectionReason('a'.repeat(USERNAME_MAX_LENGTH))).toBeNull();
  });

  it('agrees with the DTO decorators: a name containing a reserved word is fine', () => {
    expect(usernameRejectionReason('admin.joao')).toBeNull();
  });
});
