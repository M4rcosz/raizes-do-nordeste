import type {
  ChatGenerateRequest,
  ChatGenerateResult,
  ChatModel,
} from '@modules/ai/application/ports/chat-model.port';

// One scripted turn: either the model answers, or the provider blows up.
type ScriptedTurn = { result: ChatGenerateResult } | { error: Error };

/**
 * Scriptable ChatModel fake. Enqueue the results the "model" should return in order;
 * each generate() call shifts the next one off the queue and records the request it
 * was given, so tests can assert what was sent (messages, tools, systemInstruction).
 */
export class FakeChatModel implements ChatModel {
  private readonly queue: ScriptedTurn[] = [];
  readonly requests: ChatGenerateRequest[] = [];
  /** When the queue drains, return this instead (kept simple for the loop-cap test). */
  private fallback: ChatGenerateResult = { text: '', tokensUsed: 0 };

  enqueue(result: ChatGenerateResult): this {
    this.queue.push({ result });
    return this;
  }

  /**
   * Scripts a provider failure at this position, so a test can let earlier turns
   * succeed (and be charged) before the exchange dies.
   */
  enqueueFailure(error: Error): this {
    this.queue.push({ error });
    return this;
  }

  /** Sets the value returned once the enqueued script is exhausted. */
  setFallback(result: ChatGenerateResult): this {
    this.fallback = result;
    return this;
  }

  get callCount(): number {
    return this.requests.length;
  }

  generate(req: ChatGenerateRequest): Promise<ChatGenerateResult> {
    this.requests.push(req);
    const next = this.queue.shift();
    if (next && 'error' in next) {
      return Promise.reject(next.error);
    }
    return Promise.resolve(next ? next.result : this.fallback);
  }
}
