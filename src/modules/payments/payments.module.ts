import { Module } from '@nestjs/common';
import { AuditModule } from '@modules/audit/audit.module';
import { LoyaltyModule } from '@modules/loyalty/loyalty.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { TRANSACTION_RUNNER } from '@shared/transaction/transaction-runner.port';
import { PrismaTransactionRunner } from '@shared/infrastructure/prisma/prisma-transaction-runner';
import { PaymentsController } from './infrastructure/http/controllers/payments.controller';
import { PaymentWebhookGuard } from './infrastructure/http/guards/payment-webhook.guard';
import { PAYMENT_REPOSITORY } from './domain/repositories/payment.repository';
import { PrismaPaymentRepository } from './infrastructure/persistence/prisma-payment.repository';
import { PAYMENT_GATEWAY } from './application/ports/payment-gateway.port';
import { MockPaymentGateway } from './infrastructure/gateway/mock-payment-gateway';
import { CreatePaymentUseCase } from './application/use-cases/create-payment.use-case';
import { ConfirmPaymentUseCase } from './application/use-cases/confirm-payment.use-case';
import { FindPaymentByOrderUseCase } from './application/use-cases/find-payment-by-order.use-case';
import { ExpireStalePaymentsUseCase } from './application/use-cases/expire-stale-payments.use-case';
import { StalePaymentSweeper } from './infrastructure/scheduling/stale-payment.sweeper';

@Module({
  imports: [OrdersModule, AuditModule, LoyaltyModule],
  controllers: [PaymentsController],
  providers: [
    {
      provide: PAYMENT_REPOSITORY,
      useClass: PrismaPaymentRepository,
    },
    {
      provide: PAYMENT_GATEWAY,
      useClass: MockPaymentGateway,
    },
    {
      provide: TRANSACTION_RUNNER,
      useClass: PrismaTransactionRunner,
    },
    PaymentWebhookGuard,
    CreatePaymentUseCase,
    ConfirmPaymentUseCase,
    FindPaymentByOrderUseCase,
    ExpireStalePaymentsUseCase,
    StalePaymentSweeper,
  ],
})
export class PaymentsModule {}
