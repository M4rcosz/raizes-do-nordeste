import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@shared/auth/public.decorator';

interface HealthStatus {
  status: 'ok';
  uptime: number;
}

// Liveness probe. Proves the process is up and serving HTTP. It does not touch
// the database on purpose: wired as the platform health check (Render), a deep
// check would let a transient DB blip trigger a container restart storm even
// though the app is fine. Public (no auth) and SkipThrottle so the frequent
// probe does not consume the rate limit.
@Controller('health')
export class HealthController {
  @Public()
  @SkipThrottle()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe. 200 while the process is serving.' })
  @ApiOkResponse({ description: 'The service is up.' })
  check(): HealthStatus {
    return { status: 'ok', uptime: process.uptime() };
  }
}
