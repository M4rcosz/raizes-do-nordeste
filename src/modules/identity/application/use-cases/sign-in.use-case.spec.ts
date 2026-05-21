import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { SignInUseCase } from './sign-in.use-case';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository';
import { IPasswordHasher, PASSWORD_HASHER } from '../../domain/ports/password-hasher.port';
import { ITokenSigner, TOKEN_SIGNER } from '../../domain/ports/token-signer.port';
import { User } from '../../domain/entities/user.entity';
import { UsersFetchError } from '../errors/users-fetch.error';
import { AUDIT_LOGGER, IAuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';

describe('SignInUseCase', () => {
  let useCase: SignInUseCase;
  let findByUsername: jest.MockedFunction<IUserRepository['findByUsername']>;
  let verify: jest.MockedFunction<IPasswordHasher['verify']>;
  let sign: jest.MockedFunction<ITokenSigner['sign']>;
  let auditLog: jest.MockedFunction<IAuditLogger['log']>;

  const buildUser = (overrides?: { id?: string; passwordHash?: string }): User =>
    new User(
      overrides?.id ?? 'user-1',
      'bu-1',
      'panic',
      'Pedro Panic',
      'panic@example.com',
      overrides?.passwordHash ?? 'real-hash',
      null,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
      null,
      'KITCHEN',
      true,
    );

  beforeAll(async () => {
    findByUsername = jest.fn() as jest.MockedFunction<IUserRepository['findByUsername']>;
    verify = jest.fn() as jest.MockedFunction<IPasswordHasher['verify']>;
    sign = jest.fn() as jest.MockedFunction<ITokenSigner['sign']>;
    auditLog = jest.fn() as jest.MockedFunction<IAuditLogger['log']>;

    const userRepo: jest.Mocked<IUserRepository> = { findByUsername };
    const passwordHasher: jest.Mocked<IPasswordHasher> = {
      hash: jest.fn() as jest.MockedFunction<IPasswordHasher['hash']>,
      verify,
    };
    const tokenSigner: jest.Mocked<ITokenSigner> = { sign };
    const auditLogger: jest.Mocked<IAuditLogger> = { log: auditLog };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SignInUseCase,
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: PASSWORD_HASHER, useValue: passwordHasher },
        { provide: TOKEN_SIGNER, useValue: tokenSigner },
        { provide: AUDIT_LOGGER, useValue: auditLogger },
      ],
    }).compile();

    useCase = moduleRef.get(SignInUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should return access_token on valid credentials', async () => {
      findByUsername.mockResolvedValue(buildUser({ id: 'user-1' }));
      verify.mockResolvedValue(true);
      sign.mockResolvedValue('signed.jwt.token');

      const result = await useCase.execute('panic', 'plain-password');

      expect(findByUsername).toHaveBeenCalledWith('panic');
      expect(verify).toHaveBeenCalledWith('real-hash', 'plain-password');
      expect(sign).toHaveBeenCalledWith({
        sub: 'user-1',
        username: 'panic',
        role: 'KITCHEN',
      });
      expect(result).toEqual({ access_token: 'signed.jwt.token' });
    });

    it('should throw UnauthorizedException when password is invalid', async () => {
      findByUsername.mockResolvedValue(buildUser());
      verify.mockResolvedValue(false);

      await expect(useCase.execute('panic', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(sign).not.toHaveBeenCalled();
    });

    it('should still call hasher when user does not exist (timing-safe) and throw UnauthorizedException', async () => {
      findByUsername.mockResolvedValue(null);
      verify.mockResolvedValue(false);

      await expect(useCase.execute('ghost', 'whatever')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith(null, 'whatever');
      expect(sign).not.toHaveBeenCalled();
    });

    it('should wrap repository failure in UsersFetchError with cause', async () => {
      const dbError = new Error('DB down');
      findByUsername.mockRejectedValue(dbError);

      await expect(useCase.execute('panic', 'plain')).rejects.toBeInstanceOf(UsersFetchError);
      await expect(useCase.execute('panic', 'plain')).rejects.toMatchObject({ cause: dbError });
    });
  });

  describe('audit logging', () => {
    it('should log LOGIN_SUCCESS with userId on valid credentials', async () => {
      findByUsername.mockResolvedValue(buildUser({ id: 'user-1' }));
      verify.mockResolvedValue(true);
      sign.mockResolvedValue('signed.jwt.token');

      await useCase.execute('panic', 'plain-password');

      expect(auditLog).toHaveBeenCalledTimes(1);
      expect(auditLog).toHaveBeenCalledWith({
        userId: 'user-1',
        action: AUDIT_ACTIONS.LOGIN_SUCCESS,
        entity: 'User',
        entityId: 'user-1',
        metadata: { username: 'panic' },
      });
    });

    it('should log LOGIN_FAILED with the matched userId when password is wrong', async () => {
      findByUsername.mockResolvedValue(buildUser({ id: 'user-7' }));
      verify.mockResolvedValue(false);

      await expect(useCase.execute('panic', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);

      expect(auditLog).toHaveBeenCalledTimes(1);
      expect(auditLog).toHaveBeenCalledWith({
        userId: 'user-7',
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entity: 'User',
        entityId: 'user-7',
        metadata: { username: 'panic' },
      });
    });

    it('should log LOGIN_FAILED with null userId when user does not exist', async () => {
      findByUsername.mockResolvedValue(null);
      verify.mockResolvedValue(false);

      await expect(useCase.execute('ghost', 'whatever')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(auditLog).toHaveBeenCalledTimes(1);
      expect(auditLog).toHaveBeenCalledWith({
        userId: null,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entity: 'User',
        entityId: null,
        metadata: { username: 'ghost' },
      });
    });

    it('should never include the plain password or hash in audit metadata', async () => {
      findByUsername.mockResolvedValue(buildUser({ id: 'user-1', passwordHash: 'real-hash' }));
      verify.mockResolvedValue(true);
      sign.mockResolvedValue('signed.jwt.token');

      await useCase.execute('panic', 'super-secret-password');

      const call = auditLog.mock.calls[0]?.[0];
      const serialized = JSON.stringify(call);
      expect(serialized).not.toContain('super-secret-password');
      expect(serialized).not.toContain('real-hash');
      expect(serialized).not.toContain('signed.jwt.token');
    });

    it('should still succeed when auditLogger.log rejects on success path', async () => {
      findByUsername.mockResolvedValue(buildUser({ id: 'user-1' }));
      verify.mockResolvedValue(true);
      sign.mockResolvedValue('signed.jwt.token');
      auditLog.mockRejectedValue(new Error('audit DB down'));

      const result = await useCase.execute('panic', 'plain-password');

      expect(result).toEqual({ access_token: 'signed.jwt.token' });
    });

    it('should still throw UnauthorizedException when auditLogger.log rejects on failure path', async () => {
      findByUsername.mockResolvedValue(buildUser());
      verify.mockResolvedValue(false);
      auditLog.mockRejectedValue(new Error('audit DB down'));

      await expect(useCase.execute('panic', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('should not log audit when repository fails (UsersFetchError)', async () => {
      findByUsername.mockRejectedValue(new Error('DB down'));

      await expect(useCase.execute('panic', 'plain')).rejects.toBeInstanceOf(UsersFetchError);
      expect(auditLog).not.toHaveBeenCalled();
    });
  });
});
