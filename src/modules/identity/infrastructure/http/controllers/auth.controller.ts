import { SignInUseCase } from '@modules/identity/application/use-cases/sign-in.use-case';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SignInDto } from '../dto/sign-in-request.dto';
import { Public } from '@shared/auth/public.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly signInUseCase: SignInUseCase) {}

  // Stricter limit than the global one to slow credential brute-force.
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() body: SignInDto): Promise<{ access_token: string }> {
    const token = await this.signInUseCase.execute(body.username, body.password);
    return token;
  }
}
