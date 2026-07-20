import { AiMembership } from '@modules/ai/domain/entities/ai-membership.entity';
import {
  AiMembershipRepository,
  AiMembershipTransition,
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

  debit(userId: string, amount: number): Promise<boolean> {
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
