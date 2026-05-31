import { describe, expect, it } from '@jest/globals';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { currentUserFactory } from './current-user.decorator';
import { JwtPayload } from './jwt-payload.type';

const contextWith = (user?: JwtPayload): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('currentUserFactory', () => {
  const payload: JwtPayload = {
    sub: 'user-1',
    username: 'panic',
    role: 'ATTENDANT',
    iat: 1000,
    exp: 2000,
  };

  it('returns the principal AuthGuard attached to the request', () => {
    expect(currentUserFactory(undefined, contextWith(payload))).toBe(payload);
  });

  it('throws UnauthorizedException when no principal is present', () => {
    expect(() => currentUserFactory(undefined, contextWith())).toThrow(UnauthorizedException);
  });
});
