import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { IS_PUBLIC_KEY } from './public.decorator';
import { Roles } from './roles.decorator';
import { JwtPayload } from './jwt-payload.type';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let getAllAndOverride: jest.MockedFunction<Reflector['getAllAndOverride']>;
  let verifyAsync: jest.MockedFunction<(token: string) => Promise<JwtPayload>>;

  const buildContext = (
    headers: Record<string, string> = {},
  ): { ctx: ExecutionContext; request: { headers: Record<string, string>; user?: JwtPayload } } => {
    const request: { headers: Record<string, string>; user?: JwtPayload } = { headers };
    const ctx = {
      getHandler: (): null => null,
      getClass: (): null => null,
      switchToHttp: (): { getRequest: () => typeof request } => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { ctx, request };
  };

  const mockReflector = (isPublic: boolean, roles?: UserRole[]): void => {
    getAllAndOverride.mockImplementation((key: unknown) => {
      if (key === IS_PUBLIC_KEY) {
        return isPublic;
      }
      if (key === Roles) {
        return roles;
      }
      return undefined;
    });
  };

  const samplePayload: JwtPayload = {
    sub: 'user-1',
    username: 'panic',
    role: 'KITCHEN',
    businessUnitIds: ['bu-1'],
    iat: 0,
    exp: 0,
  };

  beforeAll(async () => {
    getAllAndOverride = jest.fn() as jest.MockedFunction<Reflector['getAllAndOverride']>;
    verifyAsync = jest.fn() as jest.MockedFunction<(token: string) => Promise<JwtPayload>>;

    const reflectorMock = { getAllAndOverride } as unknown as Reflector;
    const jwtServiceMock = { verifyAsync } as unknown as JwtService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthGuard,
        { provide: Reflector, useValue: reflectorMock },
        { provide: JwtService, useValue: jwtServiceMock },
      ],
    }).compile();

    guard = moduleRef.get(AuthGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('@Public() routes', () => {
    it('should bypass auth and not verify the token', async () => {
      mockReflector(true);
      const { ctx } = buildContext();

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(verifyAsync).not.toHaveBeenCalled();
    });
  });

  describe('missing or malformed Authorization header', () => {
    it('should throw UnauthorizedException when Authorization header is absent', async () => {
      mockReflector(false);
      const { ctx } = buildContext();

      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('should throw UnauthorizedException when scheme is not Bearer', async () => {
      mockReflector(false);
      const { ctx } = buildContext({ authorization: 'Basic abc' });

      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('invalid token', () => {
    it('should throw UnauthorizedException when JWT verification fails', async () => {
      mockReflector(false, ['KITCHEN']);
      verifyAsync.mockRejectedValue(new Error('invalid signature'));
      const { ctx } = buildContext({ authorization: 'Bearer bad.token' });

      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('valid token without @Roles', () => {
    it('should set request.user from the payload and return true', async () => {
      mockReflector(false, undefined);
      verifyAsync.mockResolvedValue(samplePayload);
      const { ctx, request } = buildContext({ authorization: 'Bearer good.token' });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(request.user).toEqual(samplePayload);
    });

    it('should return true when @Roles array is empty', async () => {
      mockReflector(false, []);
      verifyAsync.mockResolvedValue(samplePayload);
      const { ctx } = buildContext({ authorization: 'Bearer good.token' });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });
  });

  describe('legacy-token scope shim', () => {
    it('normalizes a single businessUnitId claim into businessUnitIds', async () => {
      mockReflector(false, undefined);
      // A token minted before the N:N migration carried businessUnitId, not the array.
      const legacy = {
        sub: 'user-1',
        username: 'panic',
        role: 'KITCHEN',
        businessUnitId: 'bu-9',
        iat: 0,
        exp: 0,
      } as unknown as JwtPayload;
      verifyAsync.mockResolvedValue(legacy);
      const { ctx, request } = buildContext({ authorization: 'Bearer legacy.token' });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(request.user?.businessUnitIds).toEqual(['bu-9']);
    });

    it('normalizes a null legacy claim into an empty array', async () => {
      mockReflector(false, undefined);
      const legacy = {
        sub: 'user-1',
        username: 'panic',
        role: 'KITCHEN',
        businessUnitId: null,
        iat: 0,
        exp: 0,
      } as unknown as JwtPayload;
      verifyAsync.mockResolvedValue(legacy);
      const { ctx, request } = buildContext({ authorization: 'Bearer legacy.token' });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(request.user?.businessUnitIds).toEqual([]);
    });
  });

  describe('@Roles enforcement', () => {
    it("should return true when payload's role is in the required roles", async () => {
      mockReflector(false, ['KITCHEN', 'ADMIN']);
      verifyAsync.mockResolvedValue(samplePayload);
      const { ctx } = buildContext({ authorization: 'Bearer good.token' });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it("should return false when payload's role is not in the required roles", async () => {
      mockReflector(false, ['ADMIN']);
      verifyAsync.mockResolvedValue(samplePayload);
      const { ctx } = buildContext({ authorization: 'Bearer good.token' });

      await expect(guard.canActivate(ctx)).resolves.toBe(false);
    });
  });
});
