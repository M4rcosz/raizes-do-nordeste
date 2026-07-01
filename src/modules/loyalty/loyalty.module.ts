import { Module } from '@nestjs/common';
import { AuditModule } from '@modules/audit/audit.module';
import { LoyaltyController } from './infrastructure/http/controllers/loyalty.controller';
import { LOYALTY_REPOSITORY } from './domain/repositories/loyalty.repository';
import { PrismaLoyaltyRepository } from './infrastructure/persistence/prisma-loyalty.repository';
import { LOYALTY_ENROLLMENT } from './application/ports/loyalty-enrollment.port';
import { LOYALTY_EARNING } from './application/ports/loyalty-earning.port';
import { LOYALTY_REDEMPTION } from './application/ports/loyalty-redemption.port';
import { GetMyLoyaltyAccountUseCase } from './application/use-cases/get-my-loyalty-account.use-case';
import { EnrollCustomerUseCase } from './application/use-cases/enroll-customer.use-case';
import { EarnPointsUseCase } from './application/use-cases/earn-points.use-case';
import { RedeemPointsUseCase } from './application/use-cases/redeem-points.use-case';
import { GiveLoyaltyConsentUseCase } from './application/use-cases/give-loyalty-consent.use-case';
import { RevokeLoyaltyConsentUseCase } from './application/use-cases/revoke-loyalty-consent.use-case';
import { ExpireLoyaltyPointsUseCase } from './application/use-cases/expire-loyalty-points.use-case';
import { LoyaltyExpirySweeper } from './infrastructure/scheduling/loyalty-expiry.sweeper';
import { LOYALTY_REVERSAL } from './application/ports/loyalty-reversal.port';
import { ReverseLoyaltyForOrderUseCase } from './application/use-cases/reverse-loyalty-for-order.use-case';
import { TRANSACTION_RUNNER } from '@shared/transaction/transaction-runner.port';
import { PrismaTransactionRunner } from '@shared/infrastructure/prisma/prisma-transaction-runner';

@Module({
  imports: [AuditModule],
  controllers: [LoyaltyController],
  providers: [
    {
      provide: LOYALTY_REPOSITORY,
      useClass: PrismaLoyaltyRepository,
    },
    {
      provide: LOYALTY_ENROLLMENT,
      useClass: EnrollCustomerUseCase,
    },
    {
      provide: LOYALTY_EARNING,
      useClass: EarnPointsUseCase,
    },
    {
      provide: LOYALTY_REDEMPTION,
      useClass: RedeemPointsUseCase,
    },
    {
      provide: LOYALTY_REVERSAL,
      useClass: ReverseLoyaltyForOrderUseCase,
    },
    {
      provide: TRANSACTION_RUNNER,
      useClass: PrismaTransactionRunner,
    },
    GetMyLoyaltyAccountUseCase,
    GiveLoyaltyConsentUseCase,
    RevokeLoyaltyConsentUseCase,
    ExpireLoyaltyPointsUseCase,
    LoyaltyExpirySweeper,
  ],
  exports: [LOYALTY_ENROLLMENT, LOYALTY_EARNING, LOYALTY_REDEMPTION, LOYALTY_REVERSAL],
})
export class LoyaltyModule {}
