import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma, type Promotion as PrismaPromotion } from '@prisma/client';
import { Money } from '@shared/domain/value-objects/money';
import type { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { CorruptPersistedMoneyError } from '@shared/errors/infrastructure/corrupt-persisted-money.error';
import { PrismaPromotionRepository } from './prisma-promotion.repository';
import { Promotion } from '@modules/promotions/domain/entities/promotion.entity';
import { DiscountType } from '@modules/promotions/domain/value-objects/discount-type';
import { BusinessUnitNotFoundError } from '@modules/promotions/domain/errors/business-unit-not-found.error';
import type { CreatePromotionInput } from '@modules/promotions/domain/repositories/promotion.repository';
import { knownRequestError } from '@shared/infrastructure/prisma/testing/prisma-mock';

type Fn = (args: unknown) => Promise<unknown>;

const knownError = (code: string): Prisma.PrismaClientKnownRequestError =>
  knownRequestError(code, { target: ['business_unit_id'] });

const persistedRow = (overrides: Partial<PrismaPromotion> = {}): PrismaPromotion => ({
  id: 'promo-1',
  businessUnitId: 'bu-1',
  name: 'Almoço',
  discountType: 'PERCENTAGE',
  discountValue: new Prisma.Decimal('10.00'),
  minOrderValue: new Prisma.Decimal('30.00'),
  startDate: new Date('2026-06-01T00:00:00.000Z'),
  endDate: new Date('2026-06-30T00:00:00.000Z'),
  isActive: true,
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
  updatedAt: new Date('2026-05-02T00:00:00.000Z'),
  ...overrides,
});

const input: CreatePromotionInput = {
  businessUnitId: 'bu-1',
  name: 'Almoço',
  discountType: DiscountType.PERCENTAGE,
  discountValue: '10.00',
  minOrderValue: '30.00',
  startDate: new Date('2026-06-01T00:00:00.000Z'),
  endDate: new Date('2026-06-30T00:00:00.000Z'),
};

describe('PrismaPromotionRepository', () => {
  let promotionCreate: jest.MockedFunction<Fn>;
  let promotionFindUnique: jest.MockedFunction<Fn>;
  let promotionFindMany: jest.MockedFunction<Fn>;
  let promotionUpdate: jest.MockedFunction<Fn>;
  let orderPromotionCreate: jest.MockedFunction<Fn>;
  let repo: PrismaPromotionRepository;

  beforeEach(() => {
    promotionCreate = jest.fn() as jest.MockedFunction<Fn>;
    promotionFindUnique = jest.fn() as jest.MockedFunction<Fn>;
    promotionFindMany = jest.fn() as jest.MockedFunction<Fn>;
    promotionUpdate = jest.fn() as jest.MockedFunction<Fn>;
    orderPromotionCreate = jest.fn() as jest.MockedFunction<Fn>;
    const prisma = {
      promotion: {
        create: promotionCreate,
        findUnique: promotionFindUnique,
        findMany: promotionFindMany,
        update: promotionUpdate,
      },
      orderPromotion: { create: orderPromotionCreate },
    } as unknown as PrismaService;
    repo = new PrismaPromotionRepository(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('forwards money as decimal strings and maps the row to a domain Promotion', async () => {
      promotionCreate.mockResolvedValue(persistedRow());

      const promotion = await repo.create(input);

      expect(promotionCreate).toHaveBeenCalledWith({
        data: {
          businessUnitId: 'bu-1',
          name: 'Almoço',
          discountType: 'PERCENTAGE',
          discountValue: '10.00',
          minOrderValue: '30.00',
          startDate: input.startDate,
          endDate: input.endDate,
        },
      });
      expect(promotion).toBeInstanceOf(Promotion);
      expect(promotion.discountValue.equals(Money.fromDecimalString('10.00'))).toBe(true);
      expect(promotion.minOrderValue.equals(Money.fromDecimalString('30.00'))).toBe(true);
    });

    it('translates a P2003 FK violation into BusinessUnitNotFoundError, chaining the cause', async () => {
      const prismaError = knownError('P2003');
      promotionCreate.mockRejectedValue(prismaError);

      await expect(repo.create(input)).rejects.toBeInstanceOf(BusinessUnitNotFoundError);
      await expect(repo.create(input)).rejects.toMatchObject({ cause: prismaError });
    });
  });

  describe('toMoney read border', () => {
    it('rethrows a corrupt persisted money value as CorruptPersistedMoneyError without leaking it', async () => {
      promotionFindUnique.mockResolvedValue(
        persistedRow({ discountValue: { toString: () => 'not-a-number' } as Prisma.Decimal }),
      );

      const error = await repo.findById('promo-1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CorruptPersistedMoneyError);
      expect((error as Error).message).not.toContain('not-a-number');
    });
  });

  describe('findActiveEligible', () => {
    it('queries the active-in-window candidates with the half-open right edge', async () => {
      const now = new Date('2026-06-15T12:00:00.000Z');
      promotionFindMany.mockResolvedValue([persistedRow()]);

      const result = await repo.findActiveEligible('bu-1', now);

      expect(promotionFindMany).toHaveBeenCalledWith({
        where: {
          businessUnitId: 'bu-1',
          isActive: true,
          startDate: { lte: now },
          endDate: { gt: now },
        },
        orderBy: [{ id: 'asc' }],
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(Promotion);
    });
  });

  describe('recordOrderPromotion', () => {
    it('inserts the OrderPromotion on the provided transaction client', async () => {
      const txCreate = jest.fn() as jest.MockedFunction<Fn>;
      const tx = { orderPromotion: { create: txCreate } } as unknown;

      await repo.recordOrderPromotion(
        { orderId: 'o-1', promotionId: 'promo-1', discountApplied: '5.00' },
        tx,
      );

      expect(txCreate).toHaveBeenCalledWith({
        data: { orderId: 'o-1', promotionId: 'promo-1', discountApplied: '5.00' },
      });
      // The non-tx client must not be used for a write inside the unit of work.
      expect(orderPromotionCreate).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('sends only the patched fields and maps the result', async () => {
      promotionUpdate.mockResolvedValue(persistedRow({ name: 'Jantar', isActive: false }));

      const updated = await repo.update('promo-1', { name: 'Jantar', isActive: false });

      expect(promotionUpdate).toHaveBeenCalledWith({
        where: { id: 'promo-1' },
        data: { name: 'Jantar', isActive: false },
      });
      expect(updated.name).toBe('Jantar');
      expect(updated.isActive).toBe(false);
    });
  });
});
