import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@shared/transaction/transaction-runner.port';
import {
  AI_MEMBERSHIP_REPOSITORY,
  type AiMembershipRepository,
} from '../../domain/repositories/ai-membership.repository';
import {
  AI_CONVERSATION_REPOSITORY,
  type AiConversationRepository,
} from '../../domain/repositories/ai-conversation.repository';
import {
  AI_TOKEN_USAGE_REPOSITORY,
  type AiTokenUsageRepository,
} from '../../domain/repositories/ai-token-usage.repository';
import { AiMessageRole } from '../../domain/value-objects/ai-message-role';
import { deriveConversationTitle } from '../../domain/value-objects/conversation-title';
import type { AiConversation } from '../../domain/entities/ai-conversation.entity';
import type { ActorContext } from '../actor-context';
import {
  CHAT_MODEL,
  type ChatGenerateResult,
  type ChatMessage,
  type ChatModel,
} from '../ports/chat-model.port';
import { ToolRegistry } from '../tools/tool-registry';
import { SYSTEM_INSTRUCTION } from '../tools/system-instruction';
import { AiNotEnrolledError } from '../errors/ai-not-enrolled.error';
import { AiTokensExhaustedError } from '../errors/ai-tokens-exhausted.error';
import { AiProviderUnavailableError } from '../errors/ai-provider-unavailable.error';
import { AiMembershipRevokedError } from '../errors/ai-membership-revoked.error';
import { AiConversationNotFoundError } from '../errors/ai-conversation-not-found.error';

export interface SendChatMessageInput {
  actor: ActorContext;
  /**
   * Continue this stored thread. When set, history comes from the database and the
   * client's `history` is ignored - the stored thread is the trusted record.
   */
  conversationId?: string;
  /** Prior turns from the client. Only user/model text is trusted; tool turns are dropped. */
  history?: ChatMessage[];
  message: string;
}

export interface SendChatMessageResult {
  /** The thread this exchange belongs to; pass it back to continue. */
  conversationId: string;
  /**
   * The thread's title. Returned on every exchange, not just the first, so a client
   * that opened the thread in an earlier session never has to fetch it separately.
   */
  conversationTitle: string;
  reply: string;
  tokensSpent: number;
  balanceRemaining: number;
}

// Bounds the manual tool-use loop: after this many model calls we stop and answer
// with whatever we have, so a model that never stops asking for tools cannot spin.
const MAX_TOOL_ITERATIONS = 5;

// Bounds the WIDTH of one iteration. The model chooses how many tools to request in
// a single turn, and each one is at least one query on the shared connection pool -
// "compare the menus of every unit" legitimately fans out per unit. Without a cap,
// one chat request could issue an unbounded number of concurrent queries and starve
// unrelated endpoints. Tokens are metered per model call, not per tool call, so
// nothing else bounds this. Dropped calls come back as an error the model can act on.
const MAX_TOOL_CALLS_PER_ITERATION = 4;

// Bounds the DEPTH of the replayed thread: only the last N stored turns are sent back
// to the model. Two reasons, both about the debit being clamped (charge() spends
// min(cost, remaining) and entry only requires balance > 0):
//   1. Without a cap, a user with 1 token left can grow a thread and then issue a
//      request whose real provider cost is arbitrary while being debited 1 token. The
//      usage ledger would then under-report actual spend - the exact thing the report
//      built on it is supposed to measure.
//   2. Once the assembled prompt passes the provider's context window, every further
//      turn of that thread fails permanently with no way back. A cap keeps an old
//      thread usable instead of turning it into a dead one.
// 40 turns is roughly 20 exchanges, enough context for a support conversation.
const MAX_REPLAYED_TURNS = 40;

const OUT_OF_TOKENS_REPLY =
  'I have run out of AI tokens for this conversation. Please ask an admin to top up your balance.';
const CAP_REACHED_REPLY =
  'I was not able to finish answering that. Please try rephrasing your question.';

/**
 * Drives the support assistant: runs the model, dispatches any tool calls under the
 * caller's actor, feeds the results back, and repeats until the model answers in
 * text (or we hit a limit). Every model call is metered against the user's AI token
 * balance and appended to the spend ledger in the same transaction; when the balance
 * drains the loop stops gracefully. The exchange is persisted as a conversation.
 */
@Injectable()
export class SendChatMessageUseCase {
  constructor(
    @Inject(AI_MEMBERSHIP_REPOSITORY)
    private readonly memberships: AiMembershipRepository,
    @Inject(CHAT_MODEL)
    private readonly chatModel: ChatModel,
    private readonly registry: ToolRegistry,
    @Inject(AI_CONVERSATION_REPOSITORY)
    private readonly conversations: AiConversationRepository,
    @Inject(AI_TOKEN_USAGE_REPOSITORY)
    private readonly usage: AiTokenUsageRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
  ) {}

  async execute(input: SendChatMessageInput): Promise<SendChatMessageResult> {
    const membership = await this.memberships.findByUserId(input.actor.userId);
    if (!membership) {
      throw new AiNotEnrolledError();
    }
    // A revoked membership is blocked regardless of any remaining balance.
    if (membership.isRevoked) {
      throw new AiMembershipRevokedError();
    }
    if (membership.tokenBalance <= 0) {
      throw new AiTokensExhaustedError();
    }

    // Resolved before the first model call because every ledger row is stamped with
    // it: spend has to be attributable even when the exchange dies halfway.
    const conversation = await this.resolveConversation(input);
    const conversationId = conversation.id;
    const conversationTitle = conversation.title;

    // A named thread replays what WE stored; the client's history is only the
    // fallback for a brand-new thread, and stays untrusted (filtered) there.
    const history =
      input.conversationId === undefined
        ? (input.history ?? [])
        : SendChatMessageUseCase.storedHistory(conversation);
    const messages = SendChatMessageUseCase.buildMessages(history, input.message);
    // Stored before the model runs, so a provider failure still leaves a record of
    // what was asked (and of what the already-charged tokens were spent on).
    await this.conversations.appendMessages(conversationId, [
      { role: AiMessageRole.USER, content: input.message },
    ]);

    let remaining = membership.tokenBalance;
    let spent = 0;
    let lastText = '';

    // Charge up to `amount` tokens against the balance, never below zero: an
    // over-cost call is clamped to whatever is left, which empties the wallet.
    // Returns what was actually persisted. A false from the atomic conditional
    // decrement means a concurrent spend already drained the balance, so we treat
    // the wallet as empty and count nothing for this call - that keeps `spent`
    // honest under a lost race (we never report tokens we did not debit).
    const charge = async (amount: number): Promise<number> => {
      const toCharge = Math.min(amount, remaining);
      if (toCharge <= 0) {
        return 0;
      }
      // Decrement and ledger row in ONE transaction, and only in the
      // debit-succeeded branch: a row without a debit invents spend, a debit
      // without a row loses it, and either way the balance and the report can
      // never be reconciled. The provider call already returned, so nothing
      // external is held open here.
      const debited = await this.transactions.run(async (tx) => {
        const ok = await this.memberships.debit(input.actor.userId, toCharge, tx);
        if (!ok) {
          return false;
        }
        await this.usage.record(
          { userId: input.actor.userId, conversationId, tokensUsed: toCharge },
          tx,
        );
        return true;
      });
      if (!debited) {
        remaining = 0;
        return 0;
      }
      remaining -= toCharge;
      return toCharge;
    };

    // Closes the exchange: stores the model's own words (never the canned notices
    // below, which the model did not say and must not read back as its own) and
    // reports what the turn cost.
    const finish = async (reply: string): Promise<SendChatMessageResult> => {
      if (lastText) {
        await this.conversations.appendMessages(conversationId, [
          { role: AiMessageRole.MODEL, content: lastText },
        ]);
      }
      return {
        conversationId,
        conversationTitle,
        reply,
        tokensSpent: spent,
        balanceRemaining: remaining,
      };
    };

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      let res: ChatGenerateResult;
      try {
        res = await this.chatModel.generate({
          systemInstruction: SYSTEM_INSTRUCTION,
          messages,
          tools: this.registry.getDeclarations(input.actor),
        });
      } catch (err) {
        // A provider failure here discards this turn. Tokens debited on earlier
        // iterations of the same exchange are NOT refunded (the work happened) and
        // their ledger rows stand; the caller sees a 503 with no reply.
        throw new AiProviderUnavailableError(undefined, { cause: err });
      }

      // Meter this call. charge() clamps to the remaining balance and drops it to
      // zero on an over-cost call or a lost race, so `spent` only ever counts
      // tokens that were actually persisted.
      spent += await charge(res.tokensUsed);

      if (res.text) {
        lastText = res.text;
      }

      if (res.functionCalls?.length) {
        messages.push({ role: 'model', functionCalls: res.functionCalls });
        // Tools are independent read-only lookups; dispatch them in parallel.
        // Promise.all preserves order, which the model needs to match each
        // functionResponse back to its functionCall.
        const toRun = res.functionCalls.slice(0, MAX_TOOL_CALLS_PER_ITERATION);
        const ran = await Promise.all(
          toRun.map((call) => this.registry.dispatch(call, input.actor)),
        );
        // Every functionCall must get a functionResponse back or the provider
        // rejects the follow-up, so the dropped ones are answered too - with a
        // signal the model can act on by asking for less.
        const dropped = res.functionCalls.slice(MAX_TOOL_CALLS_PER_ITERATION).map((call) => ({
          name: call.name,
          response: {
            error: `too many tools requested at once; at most ${MAX_TOOL_CALLS_PER_ITERATION} run per step. Ask for fewer.`,
          },
        }));
        messages.push({ role: 'tool', toolResults: [...ran, ...dropped] });

        if (remaining === 0) {
          return finish(OUT_OF_TOKENS_REPLY);
        }
        continue;
      }

      // Plain text answer: we are done.
      return finish(res.text ?? '');
    }

    // Hit the iteration cap while still being asked to run tools.
    return finish(lastText || CAP_REACHED_REPLY);
  }

  /**
   * Continues the named thread or opens a new one. A thread that is not the actor's
   * (or was soft-deleted) reads as not-found, so a foreign id cannot be continued or
   * probed for existence.
   */
  private async resolveConversation(input: SendChatMessageInput): Promise<AiConversation> {
    if (input.conversationId === undefined) {
      // A new thread is titled from the message that opens it. Derived here rather
      // than asked of the model: it costs nothing, cannot fail, and keeps the title
      // out of the metered path. An existing thread keeps whatever title it has -
      // a later message must never silently retitle a thread the owner renamed.
      return this.conversations.create(input.actor.userId, deriveConversationTitle(input.message));
    }
    // Only the replay path caps the turns; the human read path loads the thread whole.
    const existing = await this.conversations.findByIdForUser(
      input.conversationId,
      input.actor.userId,
      MAX_REPLAYED_TURNS,
    );
    if (!existing) {
      throw new AiConversationNotFoundError();
    }
    return existing;
  }

  /** Stored turns replayed as model input. Server-written, so nothing to sanitise. */
  private static storedHistory(conversation: AiConversation): ChatMessage[] {
    return conversation.messages.map((message) => ({
      role: message.role === AiMessageRole.USER ? 'user' : 'model',
      text: message.content,
    }));
  }

  private static buildMessages(history: ChatMessage[], message: string): ChatMessage[] {
    // Trust only user/model text from the client; strip any tool/functionCall turns.
    const replayed = history
      .filter(
        (m) =>
          (m.role === 'user' || m.role === 'model') &&
          typeof m.text === 'string' &&
          m.text.length > 0,
      )
      .map((m) => ({ role: m.role, text: m.text }) satisfies ChatMessage);
    return [...replayed, { role: 'user', text: message }];
  }
}
