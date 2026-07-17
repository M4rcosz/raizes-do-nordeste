import { Module } from '@nestjs/common';
import { AuditModule } from '@modules/audit/audit.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { LoyaltyModule } from '@modules/loyalty/loyalty.module';
import { AiMembershipController } from './infrastructure/http/controllers/ai-membership.controller';
import { AiChatController } from './infrastructure/http/controllers/ai-chat.controller';
import { AI_MEMBERSHIP_REPOSITORY } from './domain/repositories/ai-membership.repository';
import { PrismaAiMembershipRepository } from './infrastructure/persistence/prisma-ai-membership.repository';
import { GetMyAiMembershipUseCase } from './application/use-cases/get-my-ai-membership.use-case';
import { EnrollAiMembershipUseCase } from './application/use-cases/enroll-ai-membership.use-case';
import { AdjustAiMembershipBalanceUseCase } from './application/use-cases/adjust-ai-membership-balance.use-case';
import { SendChatMessageUseCase } from './application/use-cases/send-chat-message.use-case';
import { ToolRegistry } from './application/tools/tool-registry';
import { CHAT_MODEL } from './application/ports/chat-model.port';
import { GeminiChatModelAdapter } from './infrastructure/ai/gemini-chat-model.adapter';

@Module({
  imports: [AuditModule, OrdersModule, LoyaltyModule],
  controllers: [AiMembershipController, AiChatController],
  providers: [
    {
      provide: AI_MEMBERSHIP_REPOSITORY,
      useClass: PrismaAiMembershipRepository,
    },
    {
      provide: CHAT_MODEL,
      useClass: GeminiChatModelAdapter,
    },
    ToolRegistry,
    GetMyAiMembershipUseCase,
    EnrollAiMembershipUseCase,
    AdjustAiMembershipBalanceUseCase,
    SendChatMessageUseCase,
  ],
})
export class AiModule {}
