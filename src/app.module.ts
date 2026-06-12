import { Module, ValidationPipe } from '@nestjs/common';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    IdentityModule,
    BusinessUnitsModule,
    OrdersModule,
    PaymentsModule,
  ],
  providers: [
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
export class AppModule {}
