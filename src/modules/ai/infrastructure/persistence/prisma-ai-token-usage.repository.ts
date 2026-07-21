import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { TransactionContext } from '@shared/transaction/transaction-runner.port';
import {
  AiTokenUsageEntry,
  AiTokenUsageRepository,
  AiTokenUsageTotal,
} from '@modules/ai/domain/repositories/ai-token-usage.repository';

// TODO(test): integration-tested against a real Postgres (testcontainers) once the
// migration is applied. The groupBy aggregate needs a real DB to prove.
@Injectable()
export class PrismaAiTokenUsageRepository implements AiTokenUsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AiTokenUsageEntry, tx?: TransactionContext): Promise<void> {
    const db = (tx as Prisma.TransactionClient) ?? this.prisma;

    await db.aiTokenUsage.create({
      data: {
        userId: entry.userId,
        conversationId: entry.conversationId,
        tokensUsed: entry.tokensUsed,
      },
    });
  }

  async sumByUserInPeriod(userIds: string[], from: Date, to: Date): Promise<AiTokenUsageTotal[]> {
    // An empty `in` list matches nothing, so skip the round trip entirely.
    if (userIds.length === 0) {
      return [];
    }

    // One grouped query for the whole report instead of a sum per user. Backed by
    // the (user_id, created_at) index; the window is inclusive at both ends.
    const rows = await this.prisma.aiTokenUsage.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, createdAt: { gte: from, lte: to } },
      _sum: { tokensUsed: true },
    });

    return rows.map((row) => ({
      userId: row.userId,
      // _sum is null only when the group has no rows, which groupBy cannot produce.
      // Defaulting to 0 keeps the contract total rather than relying on that.
      tokensUsed: row._sum.tokensUsed ?? 0,
    }));
  }
}
