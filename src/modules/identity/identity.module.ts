import { Module } from '@nestjs/common';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { SignInUseCase } from './application/use-cases/sign-in.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RegisterCustomerUseCase } from './application/use-cases/register-customer.use-case';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { DeactivateUserUseCase } from './application/use-cases/deactivate-user.use-case';
import { ReactivateUserUseCase } from './application/use-cases/reactivate-user.use-case';
import { UpdateUserProfileUseCase } from './application/use-cases/update-user-profile.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { AuthController } from './infrastructure/http/controllers/auth.controller';
import { UsersController } from './infrastructure/http/controllers/users.controller';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { JwtTokenSigner } from './infrastructure/security/jwt-token-signer';
import { PASSWORD_HASHER } from './domain/ports/password-hasher.port';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher';
import { ConfigService } from '@nestjs/config';
import { TOKEN_SIGNER } from './domain/ports/token-signer.port';
import { REFRESH_TOKEN_GENERATOR } from './domain/ports/refresh-token-generator.port';
import { REFRESH_TOKEN_REPOSITORY } from './domain/repositories/refresh-token.repository';
import { REFRESH_TOKEN_TTL_MS } from './application/config/refresh-token-ttl.token';
import { CryptoRefreshTokenGenerator } from './infrastructure/security/crypto-refresh-token-generator';
import { PrismaRefreshTokenRepository } from './infrastructure/persistence/prisma-refresh-token.repository';
import { TRANSACTION_RUNNER } from '@shared/transaction/transaction-runner.port';
import { PrismaTransactionRunner } from '@shared/infrastructure/prisma/prisma-transaction-runner';
import { parseDurationMsEnv } from '@shared/config/env';
import { AuditModule } from '@modules/audit/audit.module';

// jsonwebtoken brands expiresIn as a template-literal string type; a plain env
// string needs this shape at the boundary.
type JwtExpiresIn = NonNullable<JwtModuleOptions['signOptions']>['expiresIn'];

// Access token lifetime default. Configurable via JWT_ACCESS_TTL.
const DEFAULT_ACCESS_TTL = '15m';
// Refresh token lifetime default (7d), applied by parseDurationMsEnv when JWT_REFRESH_TTL is unset.
const DEFAULT_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.getOrThrow('JWT_SECRET_KEY'),
        signOptions: {
          expiresIn: (cfg.get<string>('JWT_ACCESS_TTL') ?? DEFAULT_ACCESS_TTL) as JwtExpiresIn,
        },
      }),
    }),
    AuditModule,
  ],
  controllers: [AuthController, UsersController],
  providers: [
    {
      provide: USER_REPOSITORY,
      useClass: PrismaUserRepository,
    },
    {
      provide: PASSWORD_HASHER,
      useClass: Argon2PasswordHasher,
    },
    {
      provide: TOKEN_SIGNER,
      useClass: JwtTokenSigner,
    },
    {
      provide: REFRESH_TOKEN_GENERATOR,
      useClass: CryptoRefreshTokenGenerator,
    },
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: PrismaRefreshTokenRepository,
    },
    {
      provide: TRANSACTION_RUNNER,
      useClass: PrismaTransactionRunner,
    },
    {
      provide: REFRESH_TOKEN_TTL_MS,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): number =>
        // Pass the raw (possibly undefined) value so parseDurationMsEnv applies
        // DEFAULT_REFRESH_TTL_MS itself when JWT_REFRESH_TTL is unset.
        parseDurationMsEnv(
          'JWT_REFRESH_TTL',
          cfg.get<string>('JWT_REFRESH_TTL'),
          DEFAULT_REFRESH_TTL_MS,
        ),
    },
    SignInUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    RegisterCustomerUseCase,
    CreateUserUseCase,
    DeactivateUserUseCase,
    ReactivateUserUseCase,
    UpdateUserProfileUseCase,
    ChangePasswordUseCase,
  ],
})
export class IdentityModule {}
