import { Injectable } from '@nestjs/common';
import { Prisma, type LoyaltyAccount as LoyaltyAccountModel } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { LoyaltyAccount } from '@modules/loyalty/domain/entities/loyalty-account.entity';
import {
  EarnPointsInput,
  LoyaltyRepository,
  RedeemPointsInput,
} from '@modules/loyalty/domain/repositories/loyalty.repository';
import { LoyaltyTransactionType } from '@modules/loyalty/domain/value-objects/loyalty-transaction-type';
import { PointsRedemptionConflictError } from '@modules/loyalty/application/errors/points-redemption-conflict.error';

@Injectable()
export class PrismaLoyaltyRepository implements LoyaltyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCustomerId(
    customerId: string,
    tx?: TransactionContext,
  ): Promise<LoyaltyAccount | null> {
    const db = (tx as Prisma.TransactionClient) ?? this.prisma;

    const raw = await db.loyaltyAccount.findUnique({ where: { customerId } });
    return raw ? this.toEntity(raw) : null;
  }

  async createIfAbsent(customerId: string): Promise<void> {
    try {
      await this.prisma.loyaltyAccount.create({ data: { customerId } });
    } catch (err) {
      // Two first orders racing: the unique customerId rejects the loser, and the
      // account it wanted already exists - exactly the desired end state.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return;
      }
      throw err;
    }
  }

  async earn(input: EarnPointsInput, tx: TransactionContext): Promise<void> {
    const db = tx as Prisma.TransactionClient;

    // The (orderId, type) unique index makes EARN idempotent at the DB level: a
    // duplicate credit for the same order hits P2002 and rolls back this tx (fail
    // closed) instead of double-crediting. We do not swallow it - inside the
    // settlement tx a constraint violation aborts the transaction anyway, and the
    // settle() guard upstream already prevents the normal double-call.
    await db.loyaltyTransaction.create({
      data: {
        loyaltyAccountId: input.loyaltyAccountId,
        orderId: input.orderId,
        type: LoyaltyTransactionType.EARN,
        points: input.points,
        description: input.description,
      },
    });
    await db.loyaltyAccount.update({
      where: { id: input.loyaltyAccountId },
      data: { totalPoints: { increment: input.points } },
    });
  }

  async redeem(input: RedeemPointsInput, tx: TransactionContext): Promise<void> {
    const db = tx as Prisma.TransactionClient;

    // Insert first: the (orderId, type) unique index makes REDEEM idempotent at the
    // DB level. A second redemption for the same order hits P2002, which we surface
    // as CONFLICT (the tx rolls back, so no partial debit lands).
    try {
      await db.loyaltyTransaction.create({
        data: {
          loyaltyAccountId: input.loyaltyAccountId,
          orderId: input.orderId,
          type: LoyaltyTransactionType.REDEEM,
          points: input.points,
          description: input.description,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new PointsRedemptionConflictError(
          `Order ${input.orderId} already has a points redemption.`,
          { cause: err },
        );
      }
      throw err;
    }

    // Optimistic concurrency: the where clause (totalPoints >= points) is the guard.
    // updateMany reports the affected count, so a concurrent redemption that drained
    // the balance after our read leaves count = 0 - we throw CONFLICT instead of
    // letting the balance go negative. No SELECT FOR UPDATE.
    const { count } = await db.loyaltyAccount.updateMany({
      where: { id: input.loyaltyAccountId, totalPoints: { gte: input.points } },
      data: { totalPoints: { decrement: input.points } },
    });
    if (count === 0) {
      throw new PointsRedemptionConflictError(
        `Insufficient points to redeem ${input.points} for account ${input.loyaltyAccountId} (concurrent debit).`,
      );
    }
  }

  private toEntity(raw: LoyaltyAccountModel): LoyaltyAccount {
    return new LoyaltyAccount(
      raw.id,
      raw.customerId,
      raw.totalPoints,
      raw.consentGiven,
      raw.consentDate,
      raw.createdAt,
      raw.updatedAt,
    );
  }
}
