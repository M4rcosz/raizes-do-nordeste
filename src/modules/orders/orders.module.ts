import { Module } from '@nestjs/common';
import { OrdersController } from './infrastructure/http/controllers/orders.controller';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { FindOrderByIdUseCase } from './application/use-cases/find-order-by-id.use-case';
import { ListOrdersUseCase } from './application/use-cases/list-orders.use-case';
import { UpdateOrderStatusUseCase } from './application/use-cases/update-order-status.use-case';
import { ORDER_REPOSITORY } from './domain/repositories/order.repository';
import { PrismaOrderRepository } from './infrastructure/persistence/prisma-order.repository';
import { ORDER_PRODUCT_LOOKUP } from './application/ports/order-product-lookup.port';
import { PrismaOrderProductLookup } from './infrastructure/persistence/prisma-order-product-lookup';
import { TRANSACTION_RUNNER } from '@shared/transaction/transaction-runner.port';
import { PrismaTransactionRunner } from '@shared/infrastructure/prisma/prisma-transaction-runner';
import { AuditModule } from '@modules/audit/audit.module';
import { ORDER_FOR_PAYMENT } from './application/ports/order-for-payment.port';
import { OrderForPaymentService } from './application/services/order-for-payment.service';

@Module({
  imports: [AuditModule],
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
    CreateOrderUseCase,
    FindOrderByIdUseCase,
    ListOrdersUseCase,
    UpdateOrderStatusUseCase,
  ],
  exports: [ORDER_FOR_PAYMENT],
})
export class OrdersModule {}
