import { Module } from '@nestjs/common';
import { AuditModule } from '@modules/audit/audit.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { LoyaltyModule } from '@modules/loyalty/loyalty.module';
import { IdentityModule } from '@modules/identity/identity.module';
import { BusinessUnitsModule } from '@modules/business-units/business-units.module';
import { InventoryModule } from '@modules/inventory/inventory.module';
import { PromotionsModule } from '@modules/promotions/promotions.module';
import { TRANSACTION_RUNNER } from '@shared/transaction/transaction-runner.port';
import { PrismaTransactionRunner } from '@shared/infrastructure/prisma/prisma-transaction-runner';
import { AiMembershipController } from './infrastructure/http/controllers/ai-membership.controller';
import { AiChatController } from './infrastructure/http/controllers/ai-chat.controller';
import { AiConversationController } from './infrastructure/http/controllers/ai-conversation.controller';
import { AI_MEMBERSHIP_REPOSITORY } from './domain/repositories/ai-membership.repository';
import { PrismaAiMembershipRepository } from './infrastructure/persistence/prisma-ai-membership.repository';
import { AI_CONVERSATION_REPOSITORY } from './domain/repositories/ai-conversation.repository';
import { PrismaAiConversationRepository } from './infrastructure/persistence/prisma-ai-conversation.repository';
import { AI_TOKEN_USAGE_REPOSITORY } from './domain/repositories/ai-token-usage.repository';
import { PrismaAiTokenUsageRepository } from './infrastructure/persistence/prisma-ai-token-usage.repository';
import { GetMyAiMembershipUseCase } from './application/use-cases/get-my-ai-membership.use-case';
import { EnrollAiMembershipUseCase } from './application/use-cases/enroll-ai-membership.use-case';
import { AdjustAiMembershipBalanceUseCase } from './application/use-cases/adjust-ai-membership-balance.use-case';
import { RevokeAiMembershipUseCase } from './application/use-cases/revoke-ai-membership.use-case';
import { ReinstateAiMembershipUseCase } from './application/use-cases/reinstate-ai-membership.use-case';
import { ListAiMembershipsUseCase } from './application/use-cases/list-ai-memberships.use-case';
import { SendChatMessageUseCase } from './application/use-cases/send-chat-message.use-case';
import { ListMyConversationsUseCase } from './application/use-cases/list-my-conversations.use-case';
import { GetConversationUseCase } from './application/use-cases/get-conversation.use-case';
import { DeleteConversationUseCase } from './application/use-cases/delete-conversation.use-case';
import { ToolRegistry } from './application/tools/tool-registry';
import { CHAT_MODEL } from './application/ports/chat-model.port';
import { GeminiChatModelAdapter } from './infrastructure/ai/gemini-chat-model.adapter';

@Module({
  imports: [
    AuditModule,
    OrdersModule,
    LoyaltyModule,
    IdentityModule,
    BusinessUnitsModule,
    InventoryModule,
    PromotionsModule,
  ],
  controllers: [AiMembershipController, AiChatController, AiConversationController],
  providers: [
    {
      provide: AI_MEMBERSHIP_REPOSITORY,
      useClass: PrismaAiMembershipRepository,
    },
    {
      provide: AI_CONVERSATION_REPOSITORY,
      useClass: PrismaAiConversationRepository,
    },
    {
      provide: AI_TOKEN_USAGE_REPOSITORY,
      useClass: PrismaAiTokenUsageRepository,
    },
    {
      provide: CHAT_MODEL,
      useClass: GeminiChatModelAdapter,
    },
    {
      // The token debit and its usage-ledger row must commit together.
      provide: TRANSACTION_RUNNER,
      useClass: PrismaTransactionRunner,
    },
    ToolRegistry,
    GetMyAiMembershipUseCase,
    EnrollAiMembershipUseCase,
    AdjustAiMembershipBalanceUseCase,
    RevokeAiMembershipUseCase,
    ReinstateAiMembershipUseCase,
    ListAiMembershipsUseCase,
    SendChatMessageUseCase,
    ListMyConversationsUseCase,
    GetConversationUseCase,
    DeleteConversationUseCase,
  ],
})
export class AiModule {}
