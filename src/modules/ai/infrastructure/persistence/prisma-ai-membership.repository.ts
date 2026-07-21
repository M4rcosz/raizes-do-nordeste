import { Injectable } from '@nestjs/common';
import { Prisma, type AiMembership as AiMembershipModel } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { AiMembership } from '@modules/ai/domain/entities/ai-membership.entity';
import {
  AiMembershipRepository,
  AiMembershipTransition,
  ListAiMembershipsInput,
} from '@modules/ai/domain/repositories/ai-membership.repository';
import { AiMembershipAlreadyExistsError } from '@modules/ai/application/errors/ai-membership-already-exists.error';
import { EnrollTargetUserNotFoundError } from '@modules/ai/application/errors/enroll-target-user-not-found.error';

// TODO(test): integration-tested against a real Postgres (testcontainers) once the
// migration is applied. The conditional adjust/debit guards need a real DB to prove.
@Injectable()
export class PrismaAiMembershipRepository implements AiMembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<AiMembership | null> {
    const raw = await this.prisma.aiMembership.findUnique({ where: { userId } });
    return raw ? this.toEntity(raw) : null;
  }

  async listAll(input: ListAiMembershipsInput): Promise<AiMembership[]> {
    const { take, keyset } = input;

    // Revoked rows are included: an admin report that hid them would under-report
    // spend, since a revoked wallet keeps every token it already burned.
    //
    // Keyset, not `cursor`/`skip`: a positional cursor resolves a position in the
    // result set, so a row inserted or removed between two pages shifts it and the
    // `skip: 1` drops a row. Mirrors the orderBy exactly: (createdAt desc, id desc).
    const rows = await this.prisma.aiMembership.findMany({
      ...(keyset && {
        where: {
          OR: [
            { createdAt: { lt: keyset.createdAt } },
            { createdAt: keyset.createdAt, id: { lt: keyset.id } },
          ],
        },
      }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
    return rows.map((raw) => this.toEntity(raw));
  }

  async create(userId: string, initialBalance: number, actorId: string): Promise<AiMembership> {
    try {
      const raw = await this.prisma.aiMembership.create({
        data: { userId, tokenBalance: initialBalance, updatedById: actorId },
      });
      return this.toEntity(raw);
    } catch (err) {
      // Unique userId: a second enroll (or a concurrent race) hits P2002. Surface as
      // CONFLICT so the caller returns 409 instead of leaking a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AiMembershipAlreadyExistsError(`User ${userId} already has an AI membership.`, {
          cause: err,
        });
      }
      // FK violation: the userId has no matching user row. Surface as NOT_FOUND so a
      // typo'd id returns 404 instead of leaking a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new EnrollTargetUserNotFoundError(`User ${userId} does not exist.`, { cause: err });
      }
      throw err;
    }
  }

  async adjustBalance(
    userId: string,
    delta: number,
    actorId: string,
  ): Promise<AiMembership | null> {
    if (delta > 0) {
      // Credit: no lower bound to guard, but revoked_at IS NULL is the optimistic
      // guard so a concurrent revoke (landing between the use case pre-check and here)
      // cannot top up a revoked wallet. count = 0 means revoked or gone; return null
      // and let the caller re-read to report which.
      const { count } = await this.prisma.aiMembership.updateMany({
        where: { userId, revokedAt: null },
        data: { tokenBalance: { increment: delta }, updatedById: actorId },
      });
      if (count === 0) {
        return null;
      }
      const raw = await this.prisma.aiMembership.findUnique({ where: { userId } });
      return raw ? this.toEntity(raw) : null;
    }

    // Debit: the where clause (revoked_at IS NULL AND token_balance >= |delta|) is the
    // optimistic guard. updateMany reports the affected count, so a clawback that would
    // go below zero, hit a revoked wallet, or lose a concurrent debit leaves count = 0
    // and we return null instead of writing. No SELECT FOR UPDATE.
    const amount = -delta;
    const { count } = await this.prisma.aiMembership.updateMany({
      where: { userId, revokedAt: null, tokenBalance: { gte: amount } },
      data: { tokenBalance: { decrement: amount }, updatedById: actorId },
    });
    if (count === 0) {
      return null;
    }

    // Re-fetch the row to return. The decrement itself is atomic and race-safe; this
    // read reports the balance currently observed, which under a concurrent admin write
    // may already include that write. Acceptable for an admin tool: balanceAfter is the
    // observed post-op balance, not a guarantee of this delta's exact result.
    const raw = await this.prisma.aiMembership.findUnique({ where: { userId } });
    return raw ? this.toEntity(raw) : null;
  }

  async debit(userId: string, amount: number, tx?: TransactionContext): Promise<boolean> {
    // Guard the seam: a non-positive amount makes the gte trivially true and decrements
    // a non-positive value (no-op, or an unbounded credit for a negative). No route hits
    // this yet, but Part 2 calls it on every spend.
    if (!Number.isInteger(amount) || amount <= 0) {
      return false;
    }
    // On the caller's tx when given, so the decrement and its usage-ledger row commit
    // or roll back together.
    const db = (tx as Prisma.TransactionClient) ?? this.prisma;
    // Same conditional decrement as a negative adjust, but boolean-only: this is the
    // metering seam, called on each token spend. revoked_at IS NULL is part of the
    // guard, so a revoke landing mid-conversation makes the next spend return false
    // and the chat loop stops gracefully - no entity round-trip needed.
    const { count } = await db.aiMembership.updateMany({
      where: { userId, revokedAt: null, tokenBalance: { gte: amount } },
      data: { tokenBalance: { decrement: amount } },
    });
    return count > 0;
  }

  async revoke(userId: string, actorId: string): Promise<AiMembershipTransition | null> {
    // Conditional guard (revokedAt is null): only an active row is stamped, so
    // concurrent revokes converge to a single write. count is the number of rows this
    // call flipped (1 = we stamped it, 0 = already revoked or no row). The re-fetch
    // tells "already revoked" (row exists) apart from "no membership" (null).
    const { count } = await this.prisma.aiMembership.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), updatedById: actorId },
    });
    const raw = await this.prisma.aiMembership.findUnique({ where: { userId } });
    return raw ? { changed: count > 0, membership: this.toEntity(raw) } : null;
  }

  async reinstate(userId: string, actorId: string): Promise<AiMembershipTransition | null> {
    // Conditional guard (revokedAt is not null): only a revoked row is cleared. The
    // balance is never touched, so reinstate fully restores the prior state. count = 1
    // means this call did the clear; 0 means already active (or no row, disambiguated
    // by the re-fetch).
    const { count } = await this.prisma.aiMembership.updateMany({
      where: { userId, revokedAt: { not: null } },
      data: { revokedAt: null, updatedById: actorId },
    });
    const raw = await this.prisma.aiMembership.findUnique({ where: { userId } });
    return raw ? { changed: count > 0, membership: this.toEntity(raw) } : null;
  }

  private toEntity(raw: AiMembershipModel): AiMembership {
    return new AiMembership(
      raw.id,
      raw.userId,
      raw.tokenBalance,
      raw.createdAt,
      raw.updatedAt,
      raw.revokedAt,
    );
  }
}
