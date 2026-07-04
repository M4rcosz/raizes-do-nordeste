import { SignInUseCase } from '@modules/identity/application/use-cases/sign-in.use-case';
import { RefreshTokenUseCase } from '@modules/identity/application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from '@modules/identity/application/use-cases/logout.use-case';
import { REFRESH_TOKEN_TTL_MS } from '@modules/identity/application/config/refresh-token-ttl.token';
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { SignInDto } from '../dto/sign-in-request.dto';
import { RefreshTokenDto } from '../dto/refresh-token-request.dto';
import { LogoutDto } from '../dto/logout-request.dto';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_OPTIONS,
  type RefreshCookieOptions,
  clearRefreshCookie,
  setRefreshCookie,
} from '../refresh-cookie';
import { Public } from '@shared/auth/public.decorator';
import { readCookie } from '@shared/http/read-cookie';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly signInUseCase: SignInUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    @Inject(REFRESH_TOKEN_TTL_MS) private readonly refreshTtlMs: number,
    @Inject(REFRESH_COOKIE_OPTIONS) private readonly cookieOptions: RefreshCookieOptions,
  ) {}

  // Stricter limit than the global one to slow credential brute-force.
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiHeader({
    name: 'X-Auth-Transport',
    required: false,
    description:
      'Set to "cookie" to receive the refresh token as an httpOnly cookie instead of in the body.',
  })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() body: SignInDto,
    @Headers('x-auth-transport') transport: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ access_token: string; refresh_token?: string }> {
    const tokens = await this.signInUseCase.execute(body.username, body.password);

    // Cookie transport is opt-in. In cookie mode the refresh token leaves via an
    // httpOnly cookie and is omitted from the body; otherwise the full pair goes
    // in the body as before (mobile/Postman/tests).
    if (transport === 'cookie') {
      setRefreshCookie(res, tokens.refresh_token, this.refreshTtlMs, this.cookieOptions);
      return { access_token: tokens.access_token };
    }

    return tokens;
  }

  // Same strict limit as login: a leaked token should not be brute-forceable.
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Body() body: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ access_token: string; refresh_token?: string }> {
    // Autodetect the transport: a present cookie sticks to cookie mode, else the
    // body is used.
    const cookieTok = readCookie(req.headers.cookie, REFRESH_COOKIE_NAME);
    const plain = cookieTok ?? body.refresh_token;
    if (plain === undefined || plain === '') {
      throw new BadRequestException('refresh_token is required (cookie or body).');
    }

    const tokens = await this.refreshTokenUseCase.execute(plain);

    if (cookieTok !== undefined) {
      setRefreshCookie(res, tokens.refresh_token, this.refreshTtlMs, this.cookieOptions);
      return { access_token: tokens.access_token };
    }

    return tokens;
  }

  // Same strict limit as login/refresh to bound abuse of an unauthenticated endpoint.
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Body() body: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const cookieTok = readCookie(req.headers.cookie, REFRESH_COOKIE_NAME);
    const plain = cookieTok ?? body.refresh_token;
    if (plain === undefined || plain === '') {
      throw new BadRequestException('refresh_token is required (cookie or body).');
    }

    await this.logoutUseCase.execute(plain);
    clearRefreshCookie(res, this.cookieOptions);
  }
}
