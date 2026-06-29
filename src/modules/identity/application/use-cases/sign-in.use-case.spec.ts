import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { SignInUseCase } from './sign-in.use-case';
import { UserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository';
import { PasswordHasher, PASSWORD_HASHER } from '../../domain/ports/password-hasher.port';
import { TokenSigner, TOKEN_SIGNER } from '../../domain/ports/token-signer.port';
import {
  RefreshTokenGenerator,
  REFRESH_TOKEN_GENERATOR,
} from '../../domain/ports/refresh-token-generator.port';
import {
  RefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository';
import { REFRESH_TOKEN_TTL_MS } from '../config/refresh-token-ttl.token';
import { User } from '../../domain/entities/user.entity';
import { UsersFetchError } from '../errors/users-fetch.error';
import { InvalidCredentialsError } from '../errors/invalid-credentials.error';
import { AUDIT_LOGGER, AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';

describe('SignInUseCase', () => {
  let useCase: SignInUseCase;
  let findByUsername: jest.MockedFunction<UserRepository['findByUsername']>;
  let verify: jest.MockedFunction<PasswordHasher['verify']>;
  let sign: jest.MockedFunction<TokenSigner['sign']>;
  let generate: jest.MockedFunction<RefreshTokenGenerator['generate']>;
  let saveRefresh: jest.MockedFunction<RefreshTokenRepository['save']>;
  let auditLog: jest.MockedFunction<AuditLogger['log']>;

  const buildUser = (overrides?: {
    id?: string;
    passwordHash?: string;
    isActive?: boolean;
  }): User =>
    new User(
      overrides?.id ?? 'user-1',
      ['bu-1'],
      'panic',
      'Pedro Panic',
      'panic@example.com',
      overrides?.passwordHash ?? 'real-hash',
      null,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
      null,
      'KITCHEN',
      overrides?.isActive ?? true,
    );

  beforeAll(async () => {
    findByUsername = jest.fn() as jest.MockedFunction<UserRepository['findByUsername']>;
    verify = jest.fn() as jest.MockedFunction<PasswordHasher['verify']>;
    sign = jest.fn() as jest.MockedFunction<TokenSigner['sign']>;
    generate = jest.fn() as jest.MockedFunction<RefreshTokenGenerator['generate']>;
    saveRefresh = jest.fn() as jest.MockedFunction<RefreshTokenRepository['save']>;
    auditLog = jest.fn() as jest.MockedFunction<AuditLogger['log']>;

    const userRepo: jest.Mocked<UserRepository> = {
      findByUsername,
      findById: jest.fn() as jest.MockedFunction<UserRepository['findById']>,
      create: jest.fn() as jest.MockedFunction<UserRepository['create']>,
      deactivateIfRole: jest.fn() as jest.MockedFunction<UserRepository['deactivateIfRole']>,
      reactivateIfRole: jest.fn() as jest.MockedFunction<UserRepository['reactivateIfRole']>,
      updateProfile: jest.fn() as jest.MockedFunction<UserRepository['updateProfile']>,
    };
    const passwordHasher: jest.Mocked<PasswordHasher> = {
      hash: jest.fn() as jest.MockedFunction<PasswordHasher['hash']>,
      verify,
    };
    const tokenSigner: jest.Mocked<TokenSigner> = { sign };
    const refreshGenerator: jest.Mocked<RefreshTokenGenerator> = {
      generate,
      hash: jest.fn() as jest.MockedFunction<RefreshTokenGenerator['hash']>,
    };
    const refreshRepo: jest.Mocked<RefreshTokenRepository> = {
      findByTokenHash: jest.fn() as jest.MockedFunction<RefreshTokenRepository['findByTokenHash']>,
      save: saveRefresh,
      revoke: jest.fn() as jest.MockedFunction<RefreshTokenRepository['revoke']>,
      revokeChainFrom: jest.fn() as jest.MockedFunction<RefreshTokenRepository['revokeChainFrom']>,
    };
    const auditLogger: jest.Mocked<AuditLogger> = { log: auditLog };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SignInUseCase,
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: PASSWORD_HASHER, useValue: passwordHasher },
        { provide: TOKEN_SIGNER, useValue: tokenSigner },
        { provide: REFRESH_TOKEN_GENERATOR, useValue: refreshGenerator },
        { provide: REFRESH_TOKEN_REPOSITORY, useValue: refreshRepo },
        { provide: REFRESH_TOKEN_TTL_MS, useValue: 7 * 24 * 60 * 60 * 1000 },
        { provide: AUDIT_LOGGER, useValue: auditLogger },
      ],
    }).compile();

    useCase = moduleRef.get(SignInUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should return an access/refresh pair on valid credentials and persist the refresh', async () => {
      findByUsername.mockResolvedValue(buildUser({ id: 'user-1' }));
      verify.mockResolvedValue(true);
      sign.mockResolvedValue('signed.jwt.token');
      generate.mockReturnValue({ token: 'refresh-plain', tokenHash: 'refresh-hash' });

      const result = await useCase.execute('panic', 'plain-password');

      expect(findByUsername).toHaveBeenCalledWith('panic');
      expect(verify).toHaveBeenCalledWith('real-hash', 'plain-password');
      expect(sign).toHaveBeenCalledWith({
        sub: 'user-1',
        username: 'panic',
        role: 'KITCHEN',
        businessUnitIds: ['bu-1'],
      });
      expect(result).toEqual({ access_token: 'signed.jwt.token', refresh_token: 'refresh-plain' });

      // Only the hash is persisted, bound to the user; plaintext never stored.
      expect(saveRefresh).toHaveBeenCalledTimes(1);
      const saved = saveRefresh.mock.calls[0]?.[0];
      expect(saved?.tokenHash).toBe('refresh-hash');
      expect(saved?.userId).toBe('user-1');
    });

    it('should throw InvalidCredentialsError when password is invalid', async () => {
      findByUsername.mockResolvedValue(buildUser());
      verify.mockResolvedValue(false);

      await expect(useCase.execute('panic', 'wrong')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
      expect(sign).not.toHaveBeenCalled();
    });

    it('should still call hasher when user does not exist (timing-safe) and throw InvalidCredentialsError', async () => {
      findByUsername.mockResolvedValue(null);
      verify.mockResolvedValue(false);

      await expect(useCase.execute('ghost', 'whatever')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );

      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith(null, 'whatever');
      expect(sign).not.toHaveBeenCalled();
    });

    it('should reject an inactive user with the same InvalidCredentialsError (no status leak)', async () => {
      findByUsername.mockResolvedValue(buildUser({ id: 'user-9', isActive: false }));
      verify.mockResolvedValue(true);

      await expect(useCase.execute('panic', 'right-password')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
      expect(sign).not.toHaveBeenCalled();
    });

    it('should log LOGIN_FAILED for an inactive user', async () => {
      findByUsername.mockResolvedValue(buildUser({ id: 'user-9', isActive: false }));
      verify.mockResolvedValue(true);

      await expect(useCase.execute('panic', 'right-password')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
      expect(auditLog).toHaveBeenCalledWith({
        userId: 'user-9',
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entity: 'User',
        entityId: 'user-9',
        metadata: { username: 'panic' },
      });
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
      generate.mockReturnValue({ token: 'refresh-plain', tokenHash: 'refresh-hash' });

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

      await expect(useCase.execute('panic', 'wrong')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );

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
        InvalidCredentialsError,
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
      generate.mockReturnValue({ token: 'refresh-plain', tokenHash: 'refresh-hash' });

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
      generate.mockReturnValue({ token: 'refresh-plain', tokenHash: 'refresh-hash' });
      auditLog.mockRejectedValue(new Error('audit DB down'));

      const result = await useCase.execute('panic', 'plain-password');

      expect(result).toEqual({ access_token: 'signed.jwt.token', refresh_token: 'refresh-plain' });
    });

    it('should still throw InvalidCredentialsError when auditLogger.log rejects on failure path', async () => {
      findByUsername.mockResolvedValue(buildUser());
      verify.mockResolvedValue(false);
      auditLog.mockRejectedValue(new Error('audit DB down'));

      await expect(useCase.execute('panic', 'wrong')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
    });

    it('should not log audit when repository fails (UsersFetchError)', async () => {
      findByUsername.mockRejectedValue(new Error('DB down'));

      await expect(useCase.execute('panic', 'plain')).rejects.toBeInstanceOf(UsersFetchError);
      expect(auditLog).not.toHaveBeenCalled();
    });
  });
});
