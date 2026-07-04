import { forwardRef, Module } from '@nestjs/common';
import { PaymentsModule } from '@modules/payments/payments.module';
import { OrdersController } from './infrastructure/http/controllers/orders.controller';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { CancelOrderUseCase } from './application/use-cases/cancel-order.use-case';
import { FindOrderByIdUseCase } from './application/use-cases/find-order-by-id.use-case';
import { ListMyOrdersUseCase } from './application/use-cases/list-my-orders.use-case';
import { ListOrdersUseCase } from './application/use-cases/list-orders.use-case';
import { UpdateOrderStatusUseCase } from './application/use-cases/update-order-status.use-case';
import { ORDER_REPOSITORY } from './domain/repositories/order.repository';
import { PrismaOrderRepository } from './infrastructure/persistence/prisma-order.repository';
import { ORDER_PRODUCT_LOOKUP } from './application/ports/order-product-lookup.port';
import { PrismaOrderProductLookup } from './infrastructure/persistence/prisma-order-product-lookup';
import { TRANSACTION_RUNNER } from '@shared/transaction/transaction-runner.port';
import { PrismaTransactionRunner } from '@shared/infrastructure/prisma/prisma-transaction-runner';
import { AuditModule } from '@modules/audit/audit.module';
import { InventoryModule } from '@modules/inventory/inventory.module';
import { LoyaltyModule } from '@modules/loyalty/loyalty.module';
import { PromotionsModule } from '@modules/promotions/promotions.module';
import { ORDER_FOR_PAYMENT } from './application/ports/order-for-payment.port';
import { OrderForPaymentService } from './application/services/order-for-payment.service';
import { IDEMPOTENCY_STORE } from './application/ports/idempotency-store.port';
import { PrismaIdempotencyStore } from './infrastructure/persistence/prisma-idempotency-store';
import { ExpireIdempotencyKeysUseCase } from './application/use-cases/expire-idempotency-keys.use-case';
import { IdempotencyKeySweeper } from './infrastructure/scheduling/idempotency-key.sweeper';

@Module({
  // forwardRef on PaymentsModule: orders needs PAYMENT_REFUND for cancellation and
  // payments needs ORDER_FOR_PAYMENT, a legitimate bidirectional dependency.
  imports: [
    AuditModule,
    InventoryModule,
    LoyaltyModule,
    PromotionsModule,
    forwardRef(() => PaymentsModule),
  ],
  controllers: [OrdersController],
  providers: [
    {
      provide: ORDER_REPOSITORY,
      useClass: PrismaOrderRepository,
    },
    {
      provide: ORDER_PRODUCT_LOOKUP,
      useClass: PrismaOrderProductLookup,
    },
    {
      provide: TRANSACTION_RUNNER,
      useClass: PrismaTransactionRunner,
    },
    {
      provide: ORDER_FOR_PAYMENT,
      useClass: OrderForPaymentService,
    },
    {
      provide: IDEMPOTENCY_STORE,
      useClass: PrismaIdempotencyStore,
    },
    CreateOrderUseCase,
    CancelOrderUseCase,
    FindOrderByIdUseCase,
    ListMyOrdersUseCase,
    ListOrdersUseCase,
    UpdateOrderStatusUseCase,
    ExpireIdempotencyKeysUseCase,
    IdempotencyKeySweeper,
  ],
  exports: [ORDER_FOR_PAYMENT],
})
export class OrdersModule {}
