import type {
  LoyaltyForAi,
  LoyaltyForAiView,
} from '@modules/loyalty/application/ports/loyalty-for-ai.port';

/** In-memory LoyaltyForAi fake keyed by customerId, recording the ids it was asked for. */
export class FakeLoyaltyForAi implements LoyaltyForAi {
  private readonly accounts = new Map<string, LoyaltyForAiView>();
  readonly calls: string[] = [];

  seed(customerId: string, view: LoyaltyForAiView): this {
    this.accounts.set(customerId, view);
    return this;
  }

  getForCustomer(customerId: string): Promise<LoyaltyForAiView | null> {
    this.calls.push(customerId);
    return Promise.resolve(this.accounts.get(customerId) ?? null);
  }
}
