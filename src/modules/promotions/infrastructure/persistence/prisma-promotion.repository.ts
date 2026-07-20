import { Injectable } from '@nestjs/common';
import { Prisma, type Promotion as PrismaPromotion } from '@prisma/client';
import { Money } from '@shared/domain/value-objects/money';
import { InvalidMoneyError } from '@shared/errors/domain/invalid-money.error';
import { CorruptPersistedMoneyError } from '@shared/errors/infrastructure/corrupt-persisted-money.error';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { Promotion } from '@modules/promotions/domain/entities/promotion.entity';
import { DiscountType } from '@modules/promotions/domain/value-objects/discount-type';
import type {
  CreatePromotionInput,
  FindActivePromotionsInput,
  FindPromotionsByBusinessUnitInput,
  PromotionRepository,
  RecordOrderPromotionInput,
  UpdatePromotionInput,
} from '@modules/promotions/domain/repositories/promotion.repository';
import { BusinessUnitNotFoundError } from '@modules/promotions/domain/errors/business-unit-not-found.error';

@Injectable()
export class PrismaPromotionRepository implements PromotionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePromotionInput): Promise<Promotion> {
    try {
      const created = await this.prisma.promotion.create({
        data: {
          businessUnitId: input.businessUnitId,
          name: input.name,
          discountType: input.discountType,
          // Write border: Money was validated by the DTO; pass the decimal string through.
          discountValue: input.discountValue,
          minOrderValue: input.minOrderValue,
          startDate: input.startDate,
          endDate: input.endDate,
          ...(input.isActive !== undefined && { isActive: input.isActive }),
        },
      });
      return this.toEntity(created);
    } catch (err) {
      // A bad businessUnitId fails the FK (P2003): the admin referenced a unit that
      // does not exist. Surface as 404 instead of a raw 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new BusinessUnitNotFoundError(
          `Business unit "${input.businessUnitId}" does not exist.`,
          { cause: err },
        );
      }
      throw err;
    }
  }

  async findById(id: string): Promise<Promotion | null> {
    const raw = await this.prisma.promotion.findUnique({ where: { id } });
    return raw ? this.toEntity(raw) : null;
  }

  async findManyByBusinessUnit(input: FindPromotionsByBusinessUnitInput): Promise<Promotion[]> {
    const { businessUnitId, pagination } = input;

    const raws = await this.prisma.promotion.findMany({
      where: { businessUnitId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.take,
      ...(pagination.cursor && {
        cursor: { id: pagination.cursor },
        skip: 1,
      }),
    });

    return raws.map((raw) => this.toEntity(raw));
  }

  async findManyActive(input: FindActivePromotionsInput): Promise<Promotion[]> {
    const { businessUnitId, now, take, keyset } = input;

    // Same window predicate as findActiveEligible (half-open right edge: endDate is
    // the first instant over). Filtering in SQL, not after the page is cut, so a
    // page never comes back short because expired rows were dropped in memory.
    //
    // Keyset, not `cursor`/`skip`: the WHERE is time-varying, so the previous page's
    // last row may no longer match. Prisma's cursor is positional and would then shift
    // and silently drop a row. This compares sort VALUES, so the keyset row need not
    // exist. Mirrors the orderBy exactly: (createdAt desc, id desc).
    const raws = await this.prisma.promotion.findMany({
      where: {
        businessUnitId,
        isActive: true,
        startDate: { lte: now },
        endDate: { gt: now },
        ...(keyset && {
          OR: [
            { createdAt: { lt: keyset.createdAt } },
            { createdAt: keyset.createdAt, id: { lt: keyset.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });

    return raws.map((raw) => this.toEntity(raw));
  }

  async update(id: string, input: UpdatePromotionInput): Promise<Promotion> {
    const updated = await this.prisma.promotion.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.discountType !== undefined && { discountType: input.discountType }),
        ...(input.discountValue !== undefined && { discountValue: input.discountValue }),
        ...(input.minOrderValue !== undefined && { minOrderValue: input.minOrderValue }),
        ...(input.startDate !== undefined && { startDate: input.startDate }),
        ...(input.endDate !== undefined && { endDate: input.endDate }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
    return this.toEntity(updated);
  }

  async findActiveEligible(
    businessUnitId: string,
    now: Date,
    tx?: TransactionContext,
  ): Promise<Promotion[]> {
    const db = (tx as Prisma.TransactionClient) ?? this.prisma;

    // Window match in SQL (active and now in [startDate, endDate)); the subtotal /
    // min-order gate stays in the domain (PromotionRules) so eligibility lives in one
    // place. The half-open right edge mirrors the VO: endDate is the first instant over.
    const raws = await db.promotion.findMany({
      where: {
        businessUnitId,
        isActive: true,
        startDate: { lte: now },
        endDate: { gt: now },
      },
      orderBy: [{ id: 'asc' }],
    });

    return raws.map((raw) => this.toEntity(raw));
  }

  async recordOrderPromotion(
    input: RecordOrderPromotionInput,
    tx: TransactionContext,
  ): Promise<void> {
    const db = tx as Prisma.TransactionClient;

    await db.orderPromotion.create({
      data: {
        orderId: input.orderId,
        promotionId: input.promotionId,
        // Write border: priced discount is already a 2dp decimal string.
        discountApplied: input.discountApplied,
      },
    });
  }

  private toEntity(raw: PrismaPromotion): Promotion {
    return new Promotion(
      raw.id,
      raw.businessUnitId,
      raw.name,
      raw.discountType as DiscountType,
      this.toMoney(raw.discountValue),
      this.toMoney(raw.minOrderValue),
      raw.startDate,
      raw.endDate,
      raw.isActive,
      raw.createdAt,
      raw.updatedAt,
    );
  }

  // Read-path Money parse. A persisted value big.js rejects means corrupt DB data
  // (server fault), so we rethrow as infra error -> HTTP 500 generic, raw value stays
  // in the cause for logs only, never echoed to the client.
  private toMoney(raw: { toString(): string }): Money {
    try {
      return Money.fromDecimalString(raw.toString());
    } catch (err) {
      if (err instanceof InvalidMoneyError) {
        throw new CorruptPersistedMoneyError({ cause: err });
      }
      throw err;
    }
  }
}
