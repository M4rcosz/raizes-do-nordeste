import { Inject, Injectable } from '@nestjs/common';
import {
  AI_MEMBERSHIP_REPOSITORY,
  type AiMembershipRepository,
} from '../../domain/repositories/ai-membership.repository';
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

export interface SendChatMessageInput {
  actor: ActorContext;
  /** Prior turns from the client. Only user/model text is trusted; tool turns are dropped. */
  history?: ChatMessage[];
  message: string;
}

export interface SendChatMessageResult {
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

const OUT_OF_TOKENS_REPLY =
  'I have run out of AI tokens for this conversation. Please ask an admin to top up your balance.';
const CAP_REACHED_REPLY =
  'I was not able to finish answering that. Please try rephrasing your question.';

/**
 * Drives the support assistant: runs the model, dispatches any tool calls under the
 * caller's actor, feeds the results back, and repeats until the model answers in
 * text (or we hit a limit). Every model call is metered against the user's AI token
 * balance; when the balance drains the loop stops gracefully.
 */
@Injectable()
export class SendChatMessageUseCase {
  constructor(
    @Inject(AI_MEMBERSHIP_REPOSITORY)
    private readonly memberships: AiMembershipRepository,
    @Inject(CHAT_MODEL)
    private readonly chatModel: ChatModel,
    private readonly registry: ToolRegistry,
  ) {}

  async execute(input: SendChatMessageInput): Promise<SendChatMessageResult> {
    const membership = await this.memberships.findByUserId(input.actor.userId);
    if (!membership) {
      throw new AiNotEnrolledError();
    }
    if (membership.tokenBalance <= 0) {
      throw new AiTokensExhaustedError();
    }

    const messages = SendChatMessageUseCase.buildMessages(input);
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
      const ok = await this.memberships.debit(input.actor.userId, toCharge);
      if (!ok) {
        remaining = 0;
        return 0;
      }
      remaining -= toCharge;
      return toCharge;
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
        // iterations of the same exchange are NOT refunded (the work happened);
        // the caller sees a 503 with no reply.
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
          return { reply: OUT_OF_TOKENS_REPLY, tokensSpent: spent, balanceRemaining: remaining };
        }
        continue;
      }

      // Plain text answer: we are done.
      return { reply: res.text ?? '', tokensSpent: spent, balanceRemaining: remaining };
    }

    // Hit the iteration cap while still being asked to run tools.
    return {
      reply: lastText || CAP_REACHED_REPLY,
      tokensSpent: spent,
      balanceRemaining: remaining,
    };
  }

  private static buildMessages(input: SendChatMessageInput): ChatMessage[] {
    // Trust only user/model text from the client; strip any tool/functionCall turns.
    const history = (input.history ?? [])
      .filter(
        (m) =>
          (m.role === 'user' || m.role === 'model') &&
          typeof m.text === 'string' &&
          m.text.length > 0,
      )
      .map((m) => ({ role: m.role, text: m.text }) satisfies ChatMessage);
    return [...history, { role: 'user', text: input.message }];
  }
}
