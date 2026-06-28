import { Injectable } from '@nestjs/common';
import { Prisma, type RefreshToken as RefreshTokenModel } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { RefreshToken } from '@modules/identity/domain/entities/refresh-token.entity';
import { RefreshTokenRepository } from '@modules/identity/domain/repositories/refresh-token.repository';

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const raw = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    return raw ? this.toEntity(raw) : null;
  }

  async save(token: RefreshToken, tx?: TransactionContext): Promise<void> {
    const db = this.client(tx);
    await db.refreshToken.create({
      data: {
        id: token.id,
        tokenHash: token.tokenHash,
        userId: token.userId,
        expiresAt: token.expiresAt,
        revokedAt: token.revokedAt,
        replacedById: token.replacedById,
        createdAt: token.createdAt,
      },
    });
  }

  async revoke(id: string, replacedById: string | null, tx?: TransactionContext): Promise<number> {
    const db = this.client(tx);
    // Guard on revokedAt IS NULL so two concurrent rotations of the same token
    // cannot both win: only the first flips the row, the second gets count 0.
    const { count } = await db.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById },
    });
    return count;
  }

  async revokeChainFrom(tokenId: string, tx?: TransactionContext): Promise<void> {
    const db = this.client(tx);
    const now = new Date();

    // Walk the rotation chain forward via replacedById. The chain is short
    // (one row per refresh), and following it from the presented token reaches
    // every still-active descendant, so we revoke the whole live family.
    let currentId: string | null = tokenId;
    while (currentId !== null) {
      const row: RefreshTokenModel | null = await db.refreshToken.findUnique({
        where: { id: currentId },
      });
      if (row === null) {
        break;
      }
      if (row.revokedAt === null) {
        await db.refreshToken.update({ where: { id: row.id }, data: { revokedAt: now } });
      }
      currentId = row.replacedById;
    }
  }

  async revokeAllActiveForUser(userId: string, tx?: TransactionContext): Promise<number> {
    const db = this.client(tx);
    // Single bulk write over every live token of the user. Already-revoked rows
    // are excluded by the guard, so the count reflects only freshly killed ones.
    const { count } = await db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  // Use the open transaction client when threaded, otherwise the base connection.
  private client(tx?: TransactionContext): Prisma.TransactionClient {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }

  private toEntity(raw: RefreshTokenModel): RefreshToken {
    return RefreshToken.fromPersistence({
      id: raw.id,
      userId: raw.userId,
      tokenHash: raw.tokenHash,
      expiresAt: raw.expiresAt,
      revokedAt: raw.revokedAt,
      replacedById: raw.replacedById,
      createdAt: raw.createdAt,
    });
  }
}
