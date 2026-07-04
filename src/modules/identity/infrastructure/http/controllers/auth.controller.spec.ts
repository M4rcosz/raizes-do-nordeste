import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { SignInUseCase } from '../../../application/use-cases/sign-in.use-case';
import { RefreshTokenUseCase } from '../../../application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from '../../../application/use-cases/logout.use-case';
import { REFRESH_TOKEN_TTL_MS } from '../../../application/config/refresh-token-ttl.token';
import { REFRESH_COOKIE_OPTIONS } from '../refresh-cookie';

// Minimal express Response stub: only cookie/clearCookie are touched by the
// controller under @Res({ passthrough: true }).
function mockRes(): Response {
  return { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;
}

// Minimal express Request stub carrying just the Cookie header.
function mockReq(cookie?: string): Request {
  return { headers: { cookie } } as unknown as Request;
}

describe('AuthController', () => {
  let controller: AuthController;
  let signInUseCase: jest.Mocked<SignInUseCase>;
  let refreshTokenUseCase: jest.Mocked<RefreshTokenUseCase>;
  let logoutUseCase: jest.Mocked<LogoutUseCase>;

  beforeAll(async () => {
    signInUseCase = { execute: jest.fn() } as unknown as jest.Mocked<SignInUseCase>;
    refreshTokenUseCase = { execute: jest.fn() } as unknown as jest.Mocked<RefreshTokenUseCase>;
    logoutUseCase = { execute: jest.fn() } as unknown as jest.Mocked<LogoutUseCase>;

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: SignInUseCase, useValue: signInUseCase },
        { provide: RefreshTokenUseCase, useValue: refreshTokenUseCase },
        { provide: LogoutUseCase, useValue: logoutUseCase },
        { provide: REFRESH_TOKEN_TTL_MS, useValue: 604_800_000 },
        { provide: REFRESH_COOKIE_OPTIONS, useValue: { secure: true, sameSite: 'strict' } },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('returns the full token pair in the body and sets no cookie without the transport header', async () => {
      signInUseCase.execute.mockResolvedValue({
        access_token: 'jwt.token',
        refresh_token: 'refresh.value',
      });
      const res = mockRes();

      const result = await controller.login(
        { username: 'panic', password: 'password1' },
        undefined,
        res,
      );

      expect(signInUseCase.execute).toHaveBeenCalledWith('panic', 'password1');
      expect(result).toEqual({ access_token: 'jwt.token', refresh_token: 'refresh.value' });
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('sets the refresh cookie and omits it from the body in cookie transport', async () => {
      signInUseCase.execute.mockResolvedValue({
        access_token: 'jwt.token',
        refresh_token: 'refresh.value',
      });
      const res = mockRes();

      const result = await controller.login(
        { username: 'panic', password: 'password1' },
        'cookie',
        res,
      );

      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh.value',
        expect.objectContaining({ httpOnly: true, path: '/api/auth' }),
      );
      expect(result).toEqual({ access_token: 'jwt.token' });
    });

    it('should propagate errors raised by the use case', async () => {
      const error = new Error('boom');
      signInUseCase.execute.mockRejectedValue(error);

      await expect(
        controller.login({ username: 'panic', password: 'password1' }, undefined, mockRes()),
      ).rejects.toBe(error);
    });
  });

  describe('refresh', () => {
    it('uses the cookie token, rotates the cookie and returns only the access token', async () => {
      refreshTokenUseCase.execute.mockResolvedValue({
        access_token: 'new.jwt',
        refresh_token: 'new.refresh',
      });
      const res = mockRes();

      const result = await controller.refresh({}, mockReq('refresh_token=abc'), res);

      expect(refreshTokenUseCase.execute).toHaveBeenCalledWith('abc');
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'new.refresh',
        expect.objectContaining({ httpOnly: true, path: '/api/auth' }),
      );
      expect(result).toEqual({ access_token: 'new.jwt' });
    });

    it('falls back to the body token and returns the full pair when no cookie is present', async () => {
      refreshTokenUseCase.execute.mockResolvedValue({
        access_token: 'new.jwt',
        refresh_token: 'new.refresh',
      });
      const res = mockRes();

      const result = await controller.refresh({ refresh_token: 'old.refresh' }, mockReq(), res);

      expect(refreshTokenUseCase.execute).toHaveBeenCalledWith('old.refresh');
      expect(res.cookie).not.toHaveBeenCalled();
      expect(result).toEqual({ access_token: 'new.jwt', refresh_token: 'new.refresh' });
    });

    it('throws BadRequestException when neither cookie nor body carries a token', async () => {
      await expect(controller.refresh({}, mockReq(), mockRes())).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(refreshTokenUseCase.execute).not.toHaveBeenCalled();
    });

    it('should propagate errors raised by the use case', async () => {
      const error = new Error('boom');
      refreshTokenUseCase.execute.mockRejectedValue(error);

      await expect(
        controller.refresh({ refresh_token: 'old.refresh' }, mockReq(), mockRes()),
      ).rejects.toBe(error);
    });
  });

  describe('logout', () => {
    it('uses the cookie token and clears the cookie', async () => {
      logoutUseCase.execute.mockResolvedValue(undefined);
      const res = mockRes();

      await controller.logout({}, mockReq('refresh_token=session.refresh'), res);

      expect(logoutUseCase.execute).toHaveBeenCalledWith('session.refresh');
      expect(res.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.objectContaining({ httpOnly: true, path: '/api/auth' }),
      );
    });

    it('uses the body token when no cookie is present', async () => {
      logoutUseCase.execute.mockResolvedValue(undefined);
      const res = mockRes();

      await controller.logout({ refresh_token: 'session.refresh' }, mockReq(), res);

      expect(logoutUseCase.execute).toHaveBeenCalledWith('session.refresh');
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it('throws BadRequestException when neither cookie nor body carries a token', async () => {
      await expect(controller.logout({}, mockReq(), mockRes())).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(logoutUseCase.execute).not.toHaveBeenCalled();
    });
  });
});
