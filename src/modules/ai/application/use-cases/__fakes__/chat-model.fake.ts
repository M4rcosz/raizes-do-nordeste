import type {
  ChatGenerateRequest,
  ChatGenerateResult,
  ChatModel,
} from '@modules/ai/application/ports/chat-model.port';

/**
 * Scriptable ChatModel fake. Enqueue the results the "model" should return in order;
 * each generate() call shifts the next one off the queue and records the request it
 * was given, so tests can assert what was sent (messages, tools, systemInstruction).
 */
export class FakeChatModel implements ChatModel {
  private readonly queue: ChatGenerateResult[] = [];
  readonly requests: ChatGenerateRequest[] = [];
  /** When the queue drains, return this instead (kept simple for the loop-cap test). */
  private fallback: ChatGenerateResult = { text: '', tokensUsed: 0 };

  enqueue(result: ChatGenerateResult): this {
    this.queue.push(result);
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
    const next = this.queue.shift() ?? this.fallback;
    return Promise.resolve(next);
  }
}
