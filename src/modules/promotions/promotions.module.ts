import { Module } from '@nestjs/common';
import { AuditModule } from '@modules/audit/audit.module';
import { PromotionsController } from './infrastructure/http/controllers/promotions.controller';
import { PROMOTION_REPOSITORY } from './domain/repositories/promotion.repository';
import { PrismaPromotionRepository } from './infrastructure/persistence/prisma-promotion.repository';
import { PROMOTION_APPLICATION } from './application/ports/promotion-application.port';
import { ApplyPromotionsUseCase } from './application/use-cases/apply-promotions.use-case';
import { CreatePromotionUseCase } from './application/use-cases/create-promotion.use-case';
import { UpdatePromotionUseCase } from './application/use-cases/update-promotion.use-case';
import { FindPromotionByIdUseCase } from './application/use-cases/find-promotion-by-id.use-case';
import { ListPromotionsUseCase } from './application/use-cases/list-promotions.use-case';
import { ListActivePromotionsUseCase } from './application/use-cases/list-active-promotions.use-case';
import { ActivatePromotionUseCase } from './application/use-cases/activate-promotion.use-case';
import { DeactivatePromotionUseCase } from './application/use-cases/deactivate-promotion.use-case';
import { PROMOTION_FOR_AI } from './application/ports/promotion-for-ai.port';
import { PromotionForAiService } from './application/services/promotion-for-ai.service';

@Module({
  imports: [AuditModule],
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
    ListActivePromotionsUseCase,
    ActivatePromotionUseCase,
    DeactivatePromotionUseCase,
    {
      provide: PROMOTION_FOR_AI,
      useClass: PromotionForAiService,
    },
  ],
  exports: [PROMOTION_APPLICATION, PROMOTION_FOR_AI],
})
export class PromotionsModule {}
