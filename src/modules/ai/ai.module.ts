import { Module } from '@nestjs/common';
import { AuditModule } from '@modules/audit/audit.module';
import { AiMembershipController } from './infrastructure/http/controllers/ai-membership.controller';
import { AI_MEMBERSHIP_REPOSITORY } from './domain/repositories/ai-membership.repository';
import { PrismaAiMembershipRepository } from './infrastructure/persistence/prisma-ai-membership.repository';
import { GetMyAiMembershipUseCase } from './application/use-cases/get-my-ai-membership.use-case';
import { EnrollAiMembershipUseCase } from './application/use-cases/enroll-ai-membership.use-case';
import { AdjustAiMembershipBalanceUseCase } from './application/use-cases/adjust-ai-membership-balance.use-case';

@Module({
  imports: [AuditModule],
  controllers: [AiMembershipController],
  providers: [
    {
      provide: AI_MEMBERSHIP_REPOSITORY,
      useClass: PrismaAiMembershipRepository,
    },
    GetMyAiMembershipUseCase,
    EnrollAiMembershipUseCase,
    AdjustAiMembershipBalanceUseCase,
  ],
})
export class AiModule {}
