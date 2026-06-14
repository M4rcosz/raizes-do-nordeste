import { Injectable } from '@nestjs/common';
import { Prisma, type LoyaltyAccount as LoyaltyAccountModel } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { LoyaltyAccount } from '@modules/loyalty/domain/entities/loyalty-account.entity';
import {
  EarnPointsInput,
  LoyaltyRepository,
} from '@modules/loyalty/domain/repositories/loyalty.repository';
import { LoyaltyTransactionType } from '@modules/loyalty/domain/value-objects/loyalty-transaction-type';

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

  async earn(input: EarnPointsInput, tx?: TransactionContext): Promise<void> {
    const db = (tx as Prisma.TransactionClient) ?? this.prisma;

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
