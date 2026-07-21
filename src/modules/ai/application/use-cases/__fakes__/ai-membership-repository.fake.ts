import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { AiMembership } from '@modules/ai/domain/entities/ai-membership.entity';
import {
  AiMembershipRepository,
  AiMembershipTransition,
  ListAiMembershipsInput,
} from '@modules/ai/domain/repositories/ai-membership.repository';
import { AiMembershipAlreadyExistsError } from '@modules/ai/application/errors/ai-membership-already-exists.error';

/**
 * In-memory AiMembershipRepository fake. Models the real behavior the use cases
 * depend on: unique-userId create (P2002 -> AlreadyExists), conditional adjust and
 * debit that never drive the balance below zero (return null/false instead).
 */
export class FakeAiMembershipRepository implements AiMembershipRepository {
  private readonly store = new Map<string, AiMembership>();
  private seq = 0;

  seed(membership: AiMembership): void {
    this.store.set(membership.userId, membership);
  }

  findByUserId(userId: string): Promise<AiMembership | null> {
    return Promise.resolve(this.store.get(userId) ?? null);
  }

  listAll(input: ListAiMembershipsInput): Promise<AiMembership[]> {
    const { take, keyset } = input;
    // Revoked rows included, (createdAt desc, id desc) - same as the real query.
    const rows = [...this.store.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      // Keyset predicate: strictly after the given sort key, never a position.
      .filter(
        (m) =>
          keyset === undefined ||
          m.createdAt < keyset.createdAt ||
          (m.createdAt.getTime() === keyset.createdAt.getTime() && m.id < keyset.id),
      )
      .slice(0, take);
    return Promise.resolve(rows);
  }

  create(userId: string, initialBalance: number): Promise<AiMembership> {
    if (this.store.has(userId)) {
      return Promise.reject(
        new AiMembershipAlreadyExistsError(`User ${userId} already has an AI membership.`),
      );
    }
    const membership = new AiMembership(
      `ai-${++this.seq}`,
      userId,
      initialBalance,
      new Date(),
      new Date(),
    );
    this.store.set(userId, membership);
    return Promise.resolve(membership);
  }

  adjustBalance(userId: string, delta: number): Promise<AiMembership | null> {
    const current = this.store.get(userId);
    // Mirror the real guard: no write on a missing or revoked wallet.
    if (!current || current.isRevoked) {
      return Promise.resolve(null);
    }
    const next = current.tokenBalance + delta;
    if (next < 0) {
      return Promise.resolve(null);
    }
    const updated = new AiMembership(
      current.id,
      userId,
      next,
      current.createdAt,
      new Date(),
      current.revokedAt,
    );
    this.store.set(userId, updated);
    return Promise.resolve(updated);
  }

  // tx is accepted and ignored: an in-memory store has nothing to enlist, but the
  // signature has to match so callers can be exercised as they really run.
  debit(userId: string, amount: number, tx?: TransactionContext): Promise<boolean> {
    void tx;
    const current = this.store.get(userId);
    // Mirror the real guard: no spend on a missing, revoked, or under-funded wallet.
    if (!current || current.isRevoked || current.tokenBalance < amount) {
      return Promise.resolve(false);
    }
    const updated = new AiMembership(
      current.id,
      userId,
      current.tokenBalance - amount,
      current.createdAt,
      new Date(),
      current.revokedAt,
    );
    this.store.set(userId, updated);
    return Promise.resolve(true);
  }

  revoke(userId: string): Promise<AiMembershipTransition | null> {
    const current = this.store.get(userId);
    if (!current) {
      return Promise.resolve(null);
    }
    // changed only when an active row is flipped; an already-revoked row keeps its
    // timestamp and reports changed = false so the caller skips the audit.
    const changed = !current.isRevoked;
    const revokedAt = current.revokedAt ?? new Date();
    const updated = new AiMembership(
      current.id,
      userId,
      current.tokenBalance,
      current.createdAt,
      new Date(),
      revokedAt,
    );
    this.store.set(userId, updated);
    return Promise.resolve({ changed, membership: updated });
  }

  reinstate(userId: string): Promise<AiMembershipTransition | null> {
    const current = this.store.get(userId);
    if (!current) {
      return Promise.resolve(null);
    }
    // changed only when a revoked row is cleared; an already-active row reports false.
    const changed = current.isRevoked;
    const updated = new AiMembership(
      current.id,
      userId,
      current.tokenBalance,
      current.createdAt,
      new Date(),
      null,
    );
    this.store.set(userId, updated);
    return Promise.resolve({ changed, membership: updated });
  }
}
