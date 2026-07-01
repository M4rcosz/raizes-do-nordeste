import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import {
  type ExistingIdempotencyRecord,
  type IdempotencyScope,
  type IdempotencyStore,
  type RecordIdempotencyInput,
} from '@modules/orders/application/ports/idempotency-store.port';
import { IdempotencyRaceError } from '@modules/orders/application/errors/idempotency-race.error';

@Injectable()
export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(private readonly prisma: PrismaService) {}

  async find(scope: IdempotencyScope): Promise<ExistingIdempotencyRecord | null> {
    // Past its TTL the key is logically gone even if the sweep has not reaped it yet, so an
    // expired row must never replay an old order. findFirst (not findUnique) lets us add the
    // expiresAt guard on top of the compound key.
    const row = await this.prisma.idempotencyKey.findFirst({
      where: {
        userId: scope.userId,
        endpoint: scope.endpoint,
        key: scope.key,
        expiresAt: { gt: new Date() },
      },
    });
    if (!row) {
      return null;
    }
    return { requestHash: row.requestHash, orderId: row.orderId };
  }

  async record(input: RecordIdempotencyInput, tx: TransactionContext): Promise<void> {
    const db = tx as Prisma.TransactionClient;
    try {
      // Clear an expired row for this key first: find() already treats it as gone, so the
      // insert below would otherwise hit the unique constraint on a key the caller may now
      // reuse. A still-live duplicate has expiresAt in the future, is not deleted, and so
      // still trips P2002 below - the genuine concurrent-winner case.
      await db.idempotencyKey.deleteMany({
        where: {
          userId: input.userId,
          endpoint: input.endpoint,
          key: input.key,
          expiresAt: { lt: new Date() },
        },
      });
      await db.idempotencyKey.create({
        data: {
          key: input.key,
          userId: input.userId,
          endpoint: input.endpoint,
          requestHash: input.requestHash,
          orderId: input.orderId,
          expiresAt: input.expiresAt,
        },
      });
    } catch (err) {
      // A concurrent request with the same key committed first: the unique
      // constraint rejects this insert. Signal a replay to the use case.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new IdempotencyRaceError({ cause: err });
      }
      throw err;
    }
  }

  async deleteExpired(now: Date): Promise<number> {
    const { count } = await this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return count;
  }
}
