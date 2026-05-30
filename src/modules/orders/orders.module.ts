import { Module } from '@nestjs/common';
import { OrdersController } from './infrastructure/http/controllers/orders.controller';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { ORDER_REPOSITORY } from './domain/repositories/order.repository';
import { PrismaOrderRepository } from './infrastructure/persistence/prisma-order.repository';
import { ORDER_PRODUCT_LOOKUP } from './application/ports/order-product-lookup.port';
import { PrismaOrderProductLookup } from './infrastructure/persistence/prisma-order-product-lookup';
import { TRANSACTION_RUNNER } from '@shared/transaction/transaction-runner.port';
import { PrismaTransactionRunner } from '@shared/infrastructure/prisma/prisma-transaction-runner';

@Module({
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
    CreateOrderUseCase,
  ],
})
export class OrdersModule {}
