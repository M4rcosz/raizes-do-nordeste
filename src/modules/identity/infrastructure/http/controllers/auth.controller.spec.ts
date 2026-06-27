import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { SignInUseCase } from '../../../application/use-cases/sign-in.use-case';
import { RefreshTokenUseCase } from '../../../application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from '../../../application/use-cases/logout.use-case';

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
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should call SignInUseCase with credentials and return its result', async () => {
      signInUseCase.execute.mockResolvedValue({
        access_token: 'jwt.token',
        refresh_token: 'refresh.value',
      });

      const result = await controller.login({ username: 'panic', password: 'password1' });

      expect(signInUseCase.execute).toHaveBeenCalledWith('panic', 'password1');
      expect(result).toEqual({ access_token: 'jwt.token', refresh_token: 'refresh.value' });
    });

    it('should propagate errors raised by the use case', async () => {
      const error = new Error('boom');
      signInUseCase.execute.mockRejectedValue(error);

      await expect(controller.login({ username: 'panic', password: 'password1' })).rejects.toBe(
        error,
      );
    });
  });

  describe('refresh', () => {
    it('should call RefreshTokenUseCase with the refresh token and return a new pair', async () => {
      refreshTokenUseCase.execute.mockResolvedValue({
        access_token: 'new.jwt',
        refresh_token: 'new.refresh',
      });

      const result = await controller.refresh({ refresh_token: 'old.refresh' });

      expect(refreshTokenUseCase.execute).toHaveBeenCalledWith('old.refresh');
      expect(result).toEqual({ access_token: 'new.jwt', refresh_token: 'new.refresh' });
    });

    it('should propagate errors raised by the use case', async () => {
      const error = new Error('boom');
      refreshTokenUseCase.execute.mockRejectedValue(error);

      await expect(controller.refresh({ refresh_token: 'old.refresh' })).rejects.toBe(error);
    });
  });

  describe('logout', () => {
    it('should call LogoutUseCase with the refresh token', async () => {
      logoutUseCase.execute.mockResolvedValue(undefined);

      await controller.logout({ refresh_token: 'session.refresh' });

      expect(logoutUseCase.execute).toHaveBeenCalledWith('session.refresh');
    });
  });
});
