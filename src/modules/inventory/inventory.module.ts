import { Module } from '@nestjs/common';
import { AuditModule } from '@modules/audit/audit.module';
import { TRANSACTION_RUNNER } from '@shared/transaction/transaction-runner.port';
import { PrismaTransactionRunner } from '@shared/infrastructure/prisma/prisma-transaction-runner';
import { InventoryController } from './infrastructure/http/controllers/inventory.controller';
import { INVENTORY_REPOSITORY } from './domain/repositories/inventory.repository';
import { PrismaInventoryRepository } from './infrastructure/persistence/prisma-inventory.repository';
import { STOCK_DEDUCTION } from './application/ports/stock-deduction.port';
import { STOCK_RESTORATION } from './application/ports/stock-restoration.port';
import { GetInventoryUseCase } from './application/use-cases/get-inventory.use-case';
import { AdjustInventoryUseCase } from './application/use-cases/adjust-inventory.use-case';
import { InitializeInventoryItemUseCase } from './application/use-cases/initialize-inventory-item.use-case';
import { DeductStockForOrderUseCase } from './application/use-cases/deduct-stock-for-order.use-case';
import { RestoreStockForOrderUseCase } from './application/use-cases/restore-stock-for-order.use-case';

@Module({
  imports: [AuditModule],
  controllers: [InventoryController],
  providers: [
    {
      provide: INVENTORY_REPOSITORY,
      useClass: PrismaInventoryRepository,
    },
    {
      provide: TRANSACTION_RUNNER,
      useClass: PrismaTransactionRunner,
    },
    {
      provide: STOCK_DEDUCTION,
      useClass: DeductStockForOrderUseCase,
    },
    {
      provide: STOCK_RESTORATION,
      useClass: RestoreStockForOrderUseCase,
    },
    GetInventoryUseCase,
    AdjustInventoryUseCase,
    InitializeInventoryItemUseCase,
  ],
  exports: [STOCK_DEDUCTION, STOCK_RESTORATION],
})
export class InventoryModule {}
