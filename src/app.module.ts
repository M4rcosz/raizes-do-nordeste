import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { PrismaModule } from '@shared/infrastructure/prisma/prisma.module';
import { BusinessUnitsModule } from '@modules/business-units/business-units.module';
import { ConfigModule } from '@nestjs/config';
import { IdentityModule } from '@modules/identity/identity.module';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { AuthGuard } from '@shared/auth/auth.guard';
import { GlobalErrorFilter } from '@shared/filter/global-error.filter';
import { AuditModule } from '@modules/audit/audit.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { InventoryModule } from '@modules/inventory/inventory.module';
import { LoyaltyModule } from '@modules/loyalty/loyalty.module';
import { AiModule } from '@modules/ai/ai.module';
import { PromotionsModule } from '@modules/promotions/promotions.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { RequestLoggingMiddleware } from '@shared/observability/request-logging.middleware';
import { HealthController } from '@shared/observability/health.controller';
import { parseIntEnv } from '@shared/config/env';

// Global rate limit defaults to 100 req / 60s per IP. Both values are read from
// env so tighter limits can be set in e2e without standing up a real clock.
// Read at module load (not inside forRoot) so the throttling e2e can set
// THROTTLE_LIMIT before requiring this module. A present but invalid value fails
// the boot instead of silently falling back to the default.
const THROTTLE_TTL_MS = parseIntEnv('THROTTLE_TTL_MS', process.env.THROTTLE_TTL_MS, 60000, {
  min: 1,
});
const THROTTLE_LIMIT = parseIntEnv('THROTTLE_LIMIT', process.env.THROTTLE_LIMIT, 100, { min: 1 });

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Uses the default in-memory storage. In a multi-instance deployment each
    // replica keeps its own counter, so the effective limit becomes limit*N and
    // the login brute-force protection weakens. Swap for
    // @nest-lab/throttler-storage-redis when scaling horizontally.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: THROTTLE_TTL_MS, limit: THROTTLE_LIMIT }],
    }),
    PrismaModule,
    AuditModule,
    IdentityModule,
    BusinessUnitsModule,
    InventoryModule,
    LoyaltyModule,
    AiModule,
    PromotionsModule,
    OrdersModule,
    PaymentsModule,
  ],
  controllers: [HealthController],
  providers: [
    // ThrottlerGuard runs before AuthGuard so even @Public() routes (login) are
    // rate limited. APP_GUARD order follows the providers array order.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalErrorFilter,
    },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('{*splat}');
  }
}
