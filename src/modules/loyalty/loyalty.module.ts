import { Module } from '@nestjs/common';
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

@Module({
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
    GetMyLoyaltyAccountUseCase,
  ],
  exports: [LOYALTY_ENROLLMENT, LOYALTY_EARNING, LOYALTY_REDEMPTION],
})
export class LoyaltyModule {}
