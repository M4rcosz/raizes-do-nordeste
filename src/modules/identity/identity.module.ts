import { Module } from '@nestjs/common';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { SignInUseCase } from './application/use-cases/sign-in.use-case';
import { RegisterCustomerUseCase } from './application/use-cases/register-customer.use-case';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { DeactivateUserUseCase } from './application/use-cases/deactivate-user.use-case';
import { AuthController } from './infrastructure/http/controllers/auth.controller';
import { UsersController } from './infrastructure/http/controllers/users.controller';
import { JwtModule } from '@nestjs/jwt';
import { JwtTokenSigner } from './infrastructure/security/jwt-token-signer';
import { PASSWORD_HASHER } from './domain/ports/password-hasher.port';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher';
import { ConfigService } from '@nestjs/config';
import { TOKEN_SIGNER } from './domain/ports/token-signer.port';
import { AuditModule } from '@modules/audit/audit.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.getOrThrow('JWT_SECRET_KEY'),
        signOptions: { expiresIn: '15m' },
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
    SignInUseCase,
    RegisterCustomerUseCase,
    CreateUserUseCase,
    DeactivateUserUseCase,
  ],
})
export class IdentityModule {}
