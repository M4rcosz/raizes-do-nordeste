import { afterEach, describe, expect, it } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/infrastructure/prisma/prisma.module';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { AiModule } from './ai.module';
import { ToolRegistry } from './application/tools/tool-registry';
import { ListAiMembershipsUseCase } from './application/use-cases/list-ai-memberships.use-case';
import { SendChatMessageUseCase } from './application/use-cases/send-chat-message.use-case';
import { DeleteConversationUseCase } from './application/use-cases/delete-conversation.use-case';

/**
 * Boots the module graph (compile only - no DB connection) to prove every provider,
 * import and export resolves. Nothing else catches this: a context that provides a
 * *-for-ai service but forgets to export its token still compiles and still passes
 * every unit test, then fails at application boot.
 */
describe('AiModule', () => {
  // Closed in afterEach, not inline: a failing assertion would otherwise leak the
  // module and can hang the Jest worker.
  let moduleRef: TestingModule | undefined;

  afterEach(async () => {
    await moduleRef?.close();
    moduleRef = undefined;
  });

  it('resolves ToolRegistry with all six for-ai ports injected', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AiModule],
    }).compile();
    const registry = moduleRef.get(ToolRegistry);

    const names = registry
      .getDeclarations({ userId: 'a', role: UserRole.ADMIN, businessUnitIds: [] })
      .map((d) => d.name);
    expect(names).toContain('listInventory');
    expect(names).toContain('listUsers');
    expect(names).toContain('listMenuItems');
  });

  it('resolves the use cases that depend on the new repositories and ports', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AiModule],
    }).compile();

    // ListAiMemberships is the one that reaches across contexts: it fails to
    // resolve unless IdentityModule actually exports USER_DIRECTORY.
    expect(moduleRef.get(ListAiMembershipsUseCase)).toBeDefined();
    // SendChatMessage now needs the conversation repo, the usage ledger and the
    // transaction runner on top of what it had.
    expect(moduleRef.get(SendChatMessageUseCase)).toBeDefined();
    expect(moduleRef.get(DeleteConversationUseCase)).toBeDefined();
  });
});
