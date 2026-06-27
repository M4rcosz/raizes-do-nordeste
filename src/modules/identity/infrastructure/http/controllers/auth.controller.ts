import {
  AuthTokens,
  SignInUseCase,
} from '@modules/identity/application/use-cases/sign-in.use-case';
import { RefreshTokenUseCase } from '@modules/identity/application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from '@modules/identity/application/use-cases/logout.use-case';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SignInDto } from '../dto/sign-in-request.dto';
import { RefreshTokenDto } from '../dto/refresh-token-request.dto';
import { LogoutDto } from '../dto/logout-request.dto';
import { Public } from '@shared/auth/public.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly signInUseCase: SignInUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
  ) {}

  // Stricter limit than the global one to slow credential brute-force.
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() body: SignInDto): Promise<AuthTokens> {
    return await this.signInUseCase.execute(body.username, body.password);
  }

  // Same strict limit as login: a leaked token should not be brute-forceable.
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() body: RefreshTokenDto): Promise<AuthTokens> {
    return await this.refreshTokenUseCase.execute(body.refresh_token);
  }

  // Same strict limit as login/refresh to bound abuse of an unauthenticated endpoint.
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Body() body: LogoutDto): Promise<void> {
    await this.logoutUseCase.execute(body.refresh_token);
  }
}
