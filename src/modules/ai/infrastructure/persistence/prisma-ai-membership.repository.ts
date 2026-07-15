import { Injectable } from '@nestjs/common';
import { Prisma, type AiMembership as AiMembershipModel } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { AiMembership } from '@modules/ai/domain/entities/ai-membership.entity';
import { AiMembershipRepository } from '@modules/ai/domain/repositories/ai-membership.repository';
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
      // Credit: no lower bound to guard, so a plain update is safe.
      const raw = await this.prisma.aiMembership.update({
        where: { userId },
        data: { tokenBalance: { increment: delta }, updatedById: actorId },
      });
      return this.toEntity(raw);
    }

    // Debit: the where clause (token_balance >= |delta|) is the optimistic guard.
    // updateMany reports the affected count, so a clawback that would go below zero
    // (or a concurrent debit) leaves count = 0 and we return null instead of going
    // negative. No SELECT FOR UPDATE.
    const amount = -delta;
    const { count } = await this.prisma.aiMembership.updateMany({
      where: { userId, tokenBalance: { gte: amount } },
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

  async debit(userId: string, amount: number): Promise<boolean> {
    // Guard the seam: a non-positive amount makes the gte trivially true and decrements
    // a non-positive value (no-op, or an unbounded credit for a negative). No route hits
    // this yet, but Part 2 calls it on every spend.
    if (!Number.isInteger(amount) || amount <= 0) {
      return false;
    }
    // Same conditional decrement as a negative adjust, but boolean-only: this is the
    // Part 2 metering seam, called on each token spend, no entity round-trip needed.
    const { count } = await this.prisma.aiMembership.updateMany({
      where: { userId, tokenBalance: { gte: amount } },
      data: { tokenBalance: { decrement: amount } },
    });
    return count > 0;
  }

  private toEntity(raw: AiMembershipModel): AiMembership {
    return new AiMembership(raw.id, raw.userId, raw.tokenBalance, raw.createdAt, raw.updatedAt);
  }
}
