import { Injectable } from '@nestjs/common';
import { Prisma, type LoyaltyAccount as LoyaltyAccountModel } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { LoyaltyAccount } from '@modules/loyalty/domain/entities/loyalty-account.entity';
import {
  AdjustPointsInput,
  EarnPointsInput,
  ExpirePointsInput,
  LoyaltyRepository,
  RedeemPointsInput,
} from '@modules/loyalty/domain/repositories/loyalty.repository';
import { LoyaltyTransactionType } from '@modules/loyalty/domain/value-objects/loyalty-transaction-type';
import type { LoyaltyLedgerEntry } from '@modules/loyalty/domain/loyalty-expiry';
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
        // This lot expires 12 months out; the sweep nets it from totalPoints then.
        expiresAt: LoyaltyAccount.earnExpiresAt(new Date()),
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

  async grantConsent(customerId: string): Promise<LoyaltyAccount> {
    const now = new Date();

    // Upsert so a customer who never ordered can still opt in: create a consented
    // account when absent, or refresh consent on the existing one (clearing any
    // prior revocation). Idempotent under repeat grants.
    const raw = await this.prisma.loyaltyAccount.upsert({
      where: { customerId },
      create: { customerId, consentGiven: true, consentDate: now },
      update: { consentGiven: true, consentDate: now, consentRevokedAt: null },
    });

    return this.toEntity(raw);
  }

  async revokeConsent(customerId: string): Promise<LoyaltyAccount | null> {
    try {
      const raw = await this.prisma.loyaltyAccount.update({
        where: { customerId },
        // consentDate stays as the original grant time; consentRevokedAt records
        // the withdrawal. Points and transactions are left intact.
        data: { consentGiven: false, consentRevokedAt: new Date() },
      });

      return this.toEntity(raw);
    } catch (err) {
      // P2025 when the customer has no account. Honor the null contract so the use
      // case raises LoyaltyAccountNotFoundError (404) instead of leaking a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }

  async findAccountIdsWithExpirablePoints(now: Date): Promise<string[]> {
    const rows = await this.prisma.loyaltyAccount.findMany({
      where: {
        totalPoints: { gt: 0 },
        loyaltyTransactions: {
          some: { type: LoyaltyTransactionType.EARN, expiresAt: { lt: now } },
        },
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async findLedger(
    loyaltyAccountId: string,
    tx: TransactionContext,
  ): Promise<LoyaltyLedgerEntry[]> {
    // TODO(scale): reads the account's whole ledger to rebuild remaining lots FIFO. The
    // daily candidate filter (findAccountIdsWithExpirablePoints) already bounds how many
    // accounts hit this, so the cost is deferred, not unbounded. The real fix is to
    // materialize a per-lot remaining balance so a sweep only touches not-fully-consumed
    // lots instead of replaying the full history. Bounding the read alone can't stay
    // correct, since FIFO consumption needs every earlier earn/redeem to place a lot.
    const db = (tx as Prisma.TransactionClient) ?? this.prisma;
    const rows = await db.loyaltyTransaction.findMany({
      where: { loyaltyAccountId },
      orderBy: { createdAt: 'asc' },
      select: { type: true, points: true, createdAt: true, expiresAt: true },
    });
    return rows.map((row) => ({
      type: row.type as LoyaltyTransactionType,
      points: row.points,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    }));
  }

  async expire(input: ExpirePointsInput, tx: TransactionContext): Promise<boolean> {
    const db = tx as Prisma.TransactionClient;

    // Decrement first under the same optimistic guard as redeem: if a concurrent debit
    // already drained the balance the count is 0 and we write nothing (no orphan EXPIRE
    // row, no need to roll back). Only on a successful decrement do we record the ledger
    // entry, so the EXPIRE transaction always matches a real balance change.
    const { count } = await db.loyaltyAccount.updateMany({
      where: { id: input.loyaltyAccountId, totalPoints: { gte: input.points } },
      data: { totalPoints: { decrement: input.points } },
    });
    if (count === 0) {
      return false;
    }

    await db.loyaltyTransaction.create({
      data: {
        loyaltyAccountId: input.loyaltyAccountId,
        orderId: null,
        type: LoyaltyTransactionType.EXPIRE,
        points: input.points,
        description: input.description,
        expiresAt: null,
      },
    });
    return true;
  }

  async adjust(input: AdjustPointsInput, tx: TransactionContext): Promise<void> {
    const db = tx as Prisma.TransactionClient;

    // Signed ADJUSTMENT with no order: points carries the direction (positive credit,
    // negative debit). The increment mirrors the sign, so totalPoints and the ledger
    // move together. The caller sizes a debit against the balance (never below zero).
    await db.loyaltyTransaction.create({
      data: {
        loyaltyAccountId: input.loyaltyAccountId,
        orderId: null,
        type: LoyaltyTransactionType.ADJUSTMENT,
        points: input.points,
        description: input.description,
        expiresAt: null,
      },
    });
    await db.loyaltyAccount.update({
      where: { id: input.loyaltyAccountId },
      data: { totalPoints: { increment: input.points } },
    });
  }

  private toEntity(raw: LoyaltyAccountModel): LoyaltyAccount {
    return new LoyaltyAccount(
      raw.id,
      raw.customerId,
      raw.totalPoints,
      raw.consentGiven,
      raw.consentDate,
      raw.consentRevokedAt,
      raw.createdAt,
      raw.updatedAt,
    );
  }
}
