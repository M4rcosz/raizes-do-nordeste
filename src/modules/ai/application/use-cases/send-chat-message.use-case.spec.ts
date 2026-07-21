import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { AiMembership } from '@modules/ai/domain/entities/ai-membership.entity';
import { AiMessageRole } from '@modules/ai/domain/value-objects/ai-message-role';
import type { TransactionRunner } from '@shared/transaction/transaction-runner.port';
import type { OrderForAiView } from '@modules/orders/application/ports/order-for-ai.port';
import type { ChatMessage } from '../ports/chat-model.port';
import { ToolRegistry } from '../tools/tool-registry';
import { FakeOrderForAi } from '../tools/__fakes__/order-for-ai.fake';
import { FakeLoyaltyForAi } from '../tools/__fakes__/loyalty-for-ai.fake';
import { FakeUserForAi } from '../tools/__fakes__/user-for-ai.fake';
import { FakeCatalogForAi } from '../tools/__fakes__/catalog-for-ai.fake';
import { FakeInventoryForAi } from '../tools/__fakes__/inventory-for-ai.fake';
import { FakePromotionForAi } from '../tools/__fakes__/promotion-for-ai.fake';
import { AiNotEnrolledError } from '../errors/ai-not-enrolled.error';
import { AiTokensExhaustedError } from '../errors/ai-tokens-exhausted.error';
import { AiProviderUnavailableError } from '../errors/ai-provider-unavailable.error';
import { AiMembershipRevokedError } from '../errors/ai-membership-revoked.error';
import { AiConversationNotFoundError } from '../errors/ai-conversation-not-found.error';
import { SendChatMessageUseCase } from './send-chat-message.use-case';
import { FakeChatModel } from './__fakes__/chat-model.fake';
import { FakeAiMembershipRepository } from './__fakes__/ai-membership-repository.fake';
import { FakeAiConversationRepository } from './__fakes__/ai-conversation-repository.fake';
import { FakeAiTokenUsageRepository } from './__fakes__/ai-token-usage-repository.fake';

const actor = { userId: 'user-1', role: UserRole.CUSTOMER, businessUnitIds: [] as string[] };

// Sentinel unit of work: lets a test assert that the debit and its ledger row are
// handed the SAME transaction context.
const TX = Symbol('tx');

function orderView(overrides: Partial<OrderForAiView> = {}): OrderForAiView {
  return {
    id: 'order-1',
    status: 'READY',
    channel: 'APP',
    businessUnitId: 'bu-1',
    customerId: 'user-1',
    total: '50.00',
    createdAt: '2026-01-01T00:00:00.000Z',
    items: [],
    ...overrides,
  };
}

describe('SendChatMessageUseCase', () => {
  let memberships: FakeAiMembershipRepository;
  let chatModel: FakeChatModel;
  let orders: FakeOrderForAi;
  let loyalty: FakeLoyaltyForAi;
  let conversations: FakeAiConversationRepository;
  let usage: FakeAiTokenUsageRepository;
  let useCase: SendChatMessageUseCase;

  const seedMembership = (balance: number): void => {
    memberships.seed(new AiMembership('ai-1', 'user-1', balance, new Date(), new Date()));
  };

  beforeEach(() => {
    memberships = new FakeAiMembershipRepository();
    chatModel = new FakeChatModel();
    orders = new FakeOrderForAi();
    loyalty = new FakeLoyaltyForAi();
    conversations = new FakeAiConversationRepository();
    usage = new FakeAiTokenUsageRepository();
    // Fake unit of work: runs the work immediately, handing it a sentinel tx so
    // tests can assert the same context reaches both writes.
    const transactions: TransactionRunner = { run: (work) => work(TX) };

    useCase = new SendChatMessageUseCase(
      memberships,
      chatModel,
      new ToolRegistry(
        orders,
        loyalty,
        new FakeUserForAi(),
        new FakeCatalogForAi(),
        new FakeInventoryForAi(),
        new FakePromotionForAi(),
      ),
      conversations,
      usage,
      transactions,
    );
  });

  it('runs a scripted tool call then returns the follow-up text answer', async () => {
    seedMembership(1000);
    orders.seed(orderView());
    chatModel
      .enqueue({
        functionCalls: [{ name: 'findOrderById', args: { orderId: 'order-1' } }],
        tokensUsed: 10,
      })
      .enqueue({ text: 'Your order is ready for pickup.', tokensUsed: 5 });

    const result = await useCase.execute({ actor, message: 'where is order-1?' });

    expect(result.reply).toBe('Your order is ready for pickup.');
    expect(chatModel.callCount).toBe(2);
    expect(orders.calls[0]?.actor.userId).toBe('user-1');

    // The second model call must carry the tool result we fed back.
    const toolTurn = chatModel.requests[1].messages.find((m) => m.role === 'tool');
    expect(toolTurn?.toolResults?.[0]).toEqual({
      name: 'findOrderById',
      response: { found: true, order: orderView() },
    });
  });

  it('caps how many tools run in one step and answers the dropped calls anyway', async () => {
    seedMembership(1000);
    orders.seed(orderView());
    // The model asks for six lookups at once. Each dispatch is at least one query on
    // the shared pool, so the width of a single turn has to be bounded independently
    // of MAX_TOOL_ITERATIONS - nothing else limits it (tokens meter model calls, not
    // tool calls).
    chatModel
      .enqueue({
        functionCalls: Array.from({ length: 6 }, () => ({
          name: 'findOrderById',
          args: { orderId: 'order-1' },
        })),
        tokensUsed: 10,
      })
      .enqueue({ text: 'Here is what I found.', tokensUsed: 5 });

    const result = await useCase.execute({ actor, message: 'look up six things' });

    expect(result.reply).toBe('Here is what I found.');
    // Only four reached the repository.
    expect(orders.calls).toHaveLength(4);

    // But all six got a response: the provider rejects a follow-up whose
    // functionCalls and functionResponses do not line up.
    const toolTurn = chatModel.requests[1].messages.find((m) => m.role === 'tool');
    expect(toolTurn?.toolResults).toHaveLength(6);
    expect(toolTurn?.toolResults?.[4].response.error).toMatch(/too many tools/);
    expect(toolTurn?.toolResults?.[5].response.error).toMatch(/too many tools/);
  });

  it('scopes findOrderById to the actor: a foreign order comes back as found:false', async () => {
    seedMembership(1000);
    orders.seed(orderView(), ['someone-else']);
    chatModel
      .enqueue({
        functionCalls: [{ name: 'findOrderById', args: { orderId: 'order-1' } }],
        tokensUsed: 10,
      })
      .enqueue({ text: 'I could not find that order.', tokensUsed: 5 });

    await useCase.execute({ actor, message: 'order-1?' });

    const toolTurn = chatModel.requests[1].messages.find((m) => m.role === 'tool');
    expect(toolTurn?.toolResults?.[0]?.response).toEqual({ found: false });
  });

  it('forces getMyLoyalty to the actor id, ignoring any args', async () => {
    seedMembership(1000);
    loyalty.seed('user-1', { pointsBalance: 30, hasConsent: true, enrolledAt: 'x' });
    chatModel
      .enqueue({
        functionCalls: [{ name: 'getMyLoyalty', args: { customerId: 'attacker' } }],
        tokensUsed: 8,
      })
      .enqueue({ text: 'You have 30 points.', tokensUsed: 4 });

    await useCase.execute({ actor, message: 'my points?' });

    expect(loyalty.calls).toEqual(['user-1']);
  });

  it('debits the balance by the summed token cost of every model call', async () => {
    seedMembership(1000);
    orders.seed(orderView());
    chatModel
      .enqueue({
        functionCalls: [{ name: 'findOrderById', args: { orderId: 'order-1' } }],
        tokensUsed: 10,
      })
      .enqueue({ text: 'done', tokensUsed: 5 });

    const result = await useCase.execute({ actor, message: 'hi' });

    expect(result.tokensSpent).toBe(15);
    expect(result.balanceRemaining).toBe(985);
    const membership = await memberships.findByUserId('user-1');
    expect(membership?.tokenBalance).toBe(985);
  });

  it('rejects a user with no membership', async () => {
    chatModel.enqueue({ text: 'never reached', tokensUsed: 1 });
    await expect(useCase.execute({ actor, message: 'hi' })).rejects.toBeInstanceOf(
      AiNotEnrolledError,
    );
    expect(chatModel.callCount).toBe(0);
    // No membership means no thread either: nothing is created before the gate.
    expect(conversations.all()).toEqual([]);
  });

  it('rejects an enrolled user whose balance is already zero', async () => {
    seedMembership(0);
    await expect(useCase.execute({ actor, message: 'hi' })).rejects.toBeInstanceOf(
      AiTokensExhaustedError,
    );
    expect(chatModel.callCount).toBe(0);
  });

  it('rejects a revoked membership even with a healthy balance', async () => {
    memberships.seed(new AiMembership('ai-1', 'user-1', 1000, new Date(), new Date(), new Date()));
    await expect(useCase.execute({ actor, message: 'hi' })).rejects.toBeInstanceOf(
      AiMembershipRevokedError,
    );
    expect(chatModel.callCount).toBe(0);
  });

  it('wraps a provider failure in AiProviderUnavailableError', async () => {
    seedMembership(1000);
    const boom = new Error('upstream 503');
    jest.spyOn(chatModel, 'generate').mockRejectedValueOnce(boom);

    const error = await useCase.execute({ actor, message: 'hi' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiProviderUnavailableError);
    expect((error as AiProviderUnavailableError).cause).toBe(boom);
  });

  it('drains to zero on an over-cost call and stops', async () => {
    seedMembership(8);
    orders.seed(orderView());
    chatModel.enqueue({
      functionCalls: [{ name: 'findOrderById', args: { orderId: 'order-1' } }],
      tokensUsed: 20,
    });

    const result = await useCase.execute({ actor, message: 'hi' });

    expect(result.tokensSpent).toBe(8);
    expect(result.balanceRemaining).toBe(0);
    expect(result.reply).toMatch(/run out of AI tokens/i);
    expect(chatModel.callCount).toBe(1);
    const membership = await memberships.findByUserId('user-1');
    expect(membership?.tokenBalance).toBe(0);
    // The clamped debit is real spend, so it is ledgered like any other.
    expect(usage.rows.map((r) => r.tokensUsed)).toEqual([8]);
  });

  it('stops after MAX_TOOL_ITERATIONS when the model never stops calling tools', async () => {
    seedMembership(1000);
    loyalty.seed('user-1', { pointsBalance: 1, hasConsent: true, enrolledAt: 'x' });
    // Every call asks for a tool again; never a text answer.
    chatModel.setFallback({
      functionCalls: [{ name: 'getMyLoyalty', args: {} }],
      tokensUsed: 1,
    });

    const result = await useCase.execute({ actor, message: 'loop' });

    expect(chatModel.callCount).toBe(5);
    expect(result.tokensSpent).toBe(5);
    expect(result.reply).toBeTruthy();
  });

  it('does not count tokens it failed to persist when the debit loses a race', async () => {
    // The balance looks healthy locally, but a concurrent exchange drained it: the
    // atomic debit returns false. We must report zero spent (not the attempted cost)
    // and stop gracefully.
    seedMembership(1000);
    orders.seed(orderView());
    jest.spyOn(memberships, 'debit').mockResolvedValueOnce(false);
    chatModel.enqueue({
      functionCalls: [{ name: 'findOrderById', args: { orderId: 'order-1' } }],
      tokensUsed: 10,
    });

    const result = await useCase.execute({ actor, message: 'hi' });

    expect(result.tokensSpent).toBe(0);
    expect(result.balanceRemaining).toBe(0);
    expect(result.reply).toMatch(/run out of AI tokens/i);
    expect(chatModel.callCount).toBe(1);
  });

  it('dispatches every tool call in a multi-call turn, preserving order', async () => {
    seedMembership(1000);
    orders.seed(orderView());
    loyalty.seed('user-1', { pointsBalance: 30, hasConsent: true, enrolledAt: 'x' });
    chatModel
      .enqueue({
        functionCalls: [
          { name: 'findOrderById', args: { orderId: 'order-1' } },
          { name: 'getMyLoyalty', args: {} },
        ],
        tokensUsed: 10,
      })
      .enqueue({ text: 'Here is what I found.', tokensUsed: 5 });

    const result = await useCase.execute({ actor, message: 'order and points?' });

    expect(result.reply).toBe('Here is what I found.');
    const toolTurn = chatModel.requests[1].messages.find((m) => m.role === 'tool');
    expect(toolTurn?.toolResults?.map((r) => r.name)).toEqual(['findOrderById', 'getMyLoyalty']);
    expect(toolTurn?.toolResults?.[0]?.response).toEqual({ found: true, order: orderView() });
    expect(toolTurn?.toolResults?.[1]?.response).toEqual({
      enrolled: true,
      loyalty: { pointsBalance: 30, hasConsent: true, enrolledAt: 'x' },
    });
  });

  it('threads the model thought signature back into the follow-up request', async () => {
    // Regression: a thinking model rejects the follow-up turn if we replay its
    // function call without the thoughtSignature it produced.
    seedMembership(1000);
    orders.seed(orderView());
    chatModel
      .enqueue({
        functionCalls: [
          { name: 'findOrderById', args: { orderId: 'order-1' }, thoughtSignature: 'sig-1' },
        ],
        tokensUsed: 10,
      })
      .enqueue({ text: 'done', tokensUsed: 5 });

    await useCase.execute({ actor, message: 'where is order-1?' });

    const modelTurn = chatModel.requests[1].messages.find((m) => m.role === 'model');
    expect(modelTurn?.functionCalls?.[0]?.thoughtSignature).toBe('sig-1');
  });

  it('replays only user/model text history and appends the new user message', async () => {
    seedMembership(1000);
    chatModel.enqueue({ text: 'ok', tokensUsed: 1 });
    const history: ChatMessage[] = [
      { role: 'user', text: 'earlier question' },
      { role: 'model', text: 'earlier answer' },
      { role: 'tool', toolResults: [{ name: 'x', response: {} }] },
    ];

    await useCase.execute({ actor, history, message: 'new question' });

    const sent = chatModel.requests[0].messages;
    expect(sent).toEqual([
      { role: 'user', text: 'earlier question' },
      { role: 'model', text: 'earlier answer' },
      { role: 'user', text: 'new question' },
    ]);
  });

  describe('metering ledger', () => {
    it('records one usage row per successful debit', async () => {
      // Tokens are metered per model call, and the first call here produced no text
      // at all - only messages would lose that spend entirely, which is why the
      // ledger is its own table.
      seedMembership(1000);
      orders.seed(orderView());
      chatModel
        .enqueue({
          functionCalls: [{ name: 'findOrderById', args: { orderId: 'order-1' } }],
          tokensUsed: 10,
        })
        .enqueue({ text: 'done', tokensUsed: 5 });

      const result = await useCase.execute({ actor, message: 'hi' });

      expect(usage.rows).toHaveLength(2);
      expect(usage.rows.map((r) => r.tokensUsed)).toEqual([10, 5]);
      expect(usage.rows.every((r) => r.userId === 'user-1')).toBe(true);
      expect(usage.rows.every((r) => r.conversationId === result.conversationId)).toBe(true);
    });

    it('writes the ledger row on the same transaction as the debit', async () => {
      seedMembership(1000);
      const debit = jest.spyOn(memberships, 'debit');
      chatModel.enqueue({ text: 'done', tokensUsed: 5 });

      await useCase.execute({ actor, message: 'hi' });

      // Same handle on both writes: a divergence here means the balance and the
      // reported spend could disagree with no way to reconcile them.
      expect(debit.mock.calls[0]?.[2]).toBe(TX);
      expect(usage.rows[0]?.tx).toBe(TX);
    });

    it('records nothing when the debit loses the race', async () => {
      // The debit is the source of truth. If it did not persist, no spend happened,
      // so a ledger row here would invent tokens the wallet never lost.
      seedMembership(1000);
      jest.spyOn(memberships, 'debit').mockResolvedValueOnce(false);
      chatModel.enqueue({ text: 'done', tokensUsed: 10 });

      const result = await useCase.execute({ actor, message: 'hi' });

      expect(result.tokensSpent).toBe(0);
      expect(usage.rows).toEqual([]);
    });

    it('keeps the rows already charged when the provider fails mid-exchange', async () => {
      // The first call happened and was paid for. A later failure discards the turn
      // but must not erase the spend that already occurred.
      seedMembership(1000);
      orders.seed(orderView());
      chatModel
        .enqueue({
          functionCalls: [{ name: 'findOrderById', args: { orderId: 'order-1' } }],
          tokensUsed: 10,
        })
        .enqueueFailure(new Error('upstream 503'));

      await expect(useCase.execute({ actor, message: 'hi' })).rejects.toBeInstanceOf(
        AiProviderUnavailableError,
      );

      expect(usage.rows.map((r) => r.tokensUsed)).toEqual([10]);
    });
  });

  describe('conversations', () => {
    it('opens a thread and returns its id', async () => {
      seedMembership(1000);
      chatModel.enqueue({ text: 'hello there', tokensUsed: 5 });

      const result = await useCase.execute({ actor, message: 'hi' });

      expect(result.conversationId).toBeTruthy();
      const stored = await conversations.findByIdForUser(result.conversationId, 'user-1');
      expect(stored).not.toBeNull();
    });

    it('persists the user turn and the model reply', async () => {
      seedMembership(1000);
      chatModel.enqueue({ text: 'hello there', tokensUsed: 5 });

      const result = await useCase.execute({ actor, message: 'hi' });

      const stored = await conversations.findByIdForUser(result.conversationId, 'user-1');
      expect(stored?.messages.map((m) => [m.role, m.content])).toEqual([
        [AiMessageRole.USER, 'hi'],
        [AiMessageRole.MODEL, 'hello there'],
      ]);
    });

    it('keeps the question when the provider fails, with no model turn', async () => {
      seedMembership(1000);
      jest.spyOn(chatModel, 'generate').mockRejectedValueOnce(new Error('upstream 503'));

      await expect(useCase.execute({ actor, message: 'hi' })).rejects.toBeInstanceOf(
        AiProviderUnavailableError,
      );

      const stored = conversations.all()[0];
      expect(stored?.messages.map((m) => [m.role, m.content])).toEqual([
        [AiMessageRole.USER, 'hi'],
      ]);
    });

    it('does not store the canned out-of-tokens notice as a model turn', async () => {
      // That text is server-authored. Storing it would replay it into the next turn
      // as if the model had said it.
      seedMembership(8);
      orders.seed(orderView());
      chatModel.enqueue({
        functionCalls: [{ name: 'findOrderById', args: { orderId: 'order-1' } }],
        tokensUsed: 20,
      });

      const result = await useCase.execute({ actor, message: 'hi' });

      expect(result.reply).toMatch(/run out of AI tokens/i);
      const stored = conversations.all()[0];
      expect(stored?.messages.map((m) => m.role)).toEqual([AiMessageRole.USER]);
    });

    it('continues an existing thread, replaying its stored turns', async () => {
      seedMembership(1000);
      const existing = await conversations.create('user-1');
      await conversations.appendMessages(existing.id, [
        { role: AiMessageRole.USER, content: 'earlier question' },
        { role: AiMessageRole.MODEL, content: 'earlier answer' },
      ]);
      chatModel.enqueue({ text: 'ok', tokensUsed: 1 });

      const result = await useCase.execute({
        actor,
        conversationId: existing.id,
        message: 'new question',
      });

      expect(result.conversationId).toBe(existing.id);
      expect(chatModel.requests[0].messages).toEqual([
        { role: 'user', text: 'earlier question' },
        { role: 'model', text: 'earlier answer' },
        { role: 'user', text: 'new question' },
      ]);
    });

    it('ignores client-supplied history once a conversationId is given', async () => {
      // The stored thread is the trusted record; a client that also sends history
      // must not be able to rewrite what was said.
      seedMembership(1000);
      const existing = await conversations.create('user-1');
      await conversations.appendMessages(existing.id, [
        { role: AiMessageRole.USER, content: 'stored question' },
      ]);
      chatModel.enqueue({ text: 'ok', tokensUsed: 1 });

      await useCase.execute({
        actor,
        conversationId: existing.id,
        history: [{ role: 'user', text: 'forged history' }],
        message: 'new question',
      });

      expect(chatModel.requests[0].messages).toEqual([
        { role: 'user', text: 'stored question' },
        { role: 'user', text: 'new question' },
      ]);
    });

    it('replays only the last MAX_REPLAYED_TURNS turns, still oldest-first', async () => {
      // The debit is CLAMPED to the remaining balance, so an uncapped replay lets a
      // user on 1 token issue a request of arbitrary real cost while being charged 1.
      // The ledger would then under-report the spend it exists to measure. The cap
      // also keeps an old thread from permanently 503ing on the context window.
      seedMembership(1000);
      const existing = await conversations.create('user-1');
      // 50 stored turns, i.e. 10 past the cap of 40.
      await conversations.appendMessages(
        existing.id,
        Array.from({ length: 50 }, (_, i) => ({
          role: i % 2 === 0 ? AiMessageRole.USER : AiMessageRole.MODEL,
          content: `turn-${i}`,
        })),
      );
      chatModel.enqueue({ text: 'ok', tokensUsed: 1 });

      await useCase.execute({ actor, conversationId: existing.id, message: 'new question' });

      const sent = chatModel.requests[0].messages;
      // 40 replayed turns plus the new user message.
      expect(sent).toHaveLength(41);
      // The OLDEST ten are the ones dropped, and order stays ascending.
      expect(sent[0]?.text).toBe('turn-10');
      expect(sent[39]?.text).toBe('turn-49');
      expect(sent[40]).toEqual({ role: 'user', text: 'new question' });
    });

    it('leaves the human read path uncapped', async () => {
      // Only the model-replay path pays per token, so only it is capped: a user must
      // still be able to read their whole thread back.
      const existing = await conversations.create('user-1');
      await conversations.appendMessages(
        existing.id,
        Array.from({ length: 50 }, (_, i) => ({
          role: AiMessageRole.USER,
          content: `turn-${i}`,
        })),
      );

      const whole = await conversations.findByIdForUser(existing.id, 'user-1');

      expect(whole?.messages).toHaveLength(50);
    });

    it('refuses a thread that belongs to someone else', async () => {
      seedMembership(1000);
      const foreign = await conversations.create('someone-else');
      chatModel.enqueue({ text: 'never reached', tokensUsed: 1 });

      await expect(
        useCase.execute({ actor, conversationId: foreign.id, message: 'hi' }),
      ).rejects.toBeInstanceOf(AiConversationNotFoundError);
      expect(chatModel.callCount).toBe(0);
    });

    it('refuses a soft-deleted thread', async () => {
      seedMembership(1000);
      const existing = await conversations.create('user-1');
      await conversations.softDelete(existing.id, 'user-1');
      chatModel.enqueue({ text: 'never reached', tokensUsed: 1 });

      await expect(
        useCase.execute({ actor, conversationId: existing.id, message: 'hi' }),
      ).rejects.toBeInstanceOf(AiConversationNotFoundError);
      expect(chatModel.callCount).toBe(0);
    });
  });
});
