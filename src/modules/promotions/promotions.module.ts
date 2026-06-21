import { Module } from '@nestjs/common';
import { PromotionsController } from './infrastructure/http/controllers/promotions.controller';
import { PROMOTION_REPOSITORY } from './domain/repositories/promotion.repository';
import { PrismaPromotionRepository } from './infrastructure/persistence/prisma-promotion.repository';
import { PROMOTION_APPLICATION } from './application/ports/promotion-application.port';
import { ApplyPromotionsUseCase } from './application/use-cases/apply-promotions.use-case';
import { CreatePromotionUseCase } from './application/use-cases/create-promotion.use-case';
import { UpdatePromotionUseCase } from './application/use-cases/update-promotion.use-case';
import { FindPromotionByIdUseCase } from './application/use-cases/find-promotion-by-id.use-case';
import { ListPromotionsUseCase } from './application/use-cases/list-promotions.use-case';

@Module({
  controllers: [PromotionsController],
  providers: [
    {
      provide: PROMOTION_REPOSITORY,
      useClass: PrismaPromotionRepository,
    },
    {
      provide: PROMOTION_APPLICATION,
      useClass: ApplyPromotionsUseCase,
    },
    CreatePromotionUseCase,
    UpdatePromotionUseCase,
    FindPromotionByIdUseCase,
    ListPromotionsUseCase,
  ],
  exports: [PROMOTION_APPLICATION],
})
export class PromotionsModule {}
