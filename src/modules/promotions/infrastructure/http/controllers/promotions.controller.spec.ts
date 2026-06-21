import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Money } from '@shared/domain/value-objects/money';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { PromotionsController } from './promotions.controller';
import { CreatePromotionUseCase } from '@modules/promotions/application/use-cases/create-promotion.use-case';
import { UpdatePromotionUseCase } from '@modules/promotions/application/use-cases/update-promotion.use-case';
import { FindPromotionByIdUseCase } from '@modules/promotions/application/use-cases/find-promotion-by-id.use-case';
import { ListPromotionsUseCase } from '@modules/promotions/application/use-cases/list-promotions.use-case';
import { Promotion } from '@modules/promotions/domain/entities/promotion.entity';
import { DiscountType } from '@modules/promotions/domain/value-objects/discount-type';
import { PromotionResponseDto } from '../dto/promotion-response.dto';
import { PromotionNotFoundError } from '@modules/promotions/application/errors/promotion-not-found.error';
import type { CreatePromotionDto } from '../dto/create-promotion.dto';

const buildPromotion = (id = 'promo-1'): Promotion =>
  new Promotion(
    id,
    'bu-1',
    'Almoço',
    DiscountType.PERCENTAGE,
    Money.fromDecimalString('10.00'),
    Money.fromDecimalString('30.00'),
    new Date('2026-06-01T00:00:00.000Z'),
    new Date('2026-06-30T00:00:00.000Z'),
    true,
    new Date('2026-05-01T00:00:00.000Z'),
    new Date('2026-05-02T00:00:00.000Z'),
  );

describe('PromotionsController', () => {
  let controller: PromotionsController;
  let createPromotion: jest.Mocked<CreatePromotionUseCase>;
  let updatePromotion: jest.Mocked<UpdatePromotionUseCase>;
  let findPromotionById: jest.Mocked<FindPromotionByIdUseCase>;
  let listPromotions: jest.Mocked<ListPromotionsUseCase>;

  beforeAll(async () => {
    createPromotion = { execute: jest.fn() } as unknown as jest.Mocked<CreatePromotionUseCase>;
    updatePromotion = { execute: jest.fn() } as unknown as jest.Mocked<UpdatePromotionUseCase>;
    findPromotionById = { execute: jest.fn() } as unknown as jest.Mocked<FindPromotionByIdUseCase>;
    listPromotions = { execute: jest.fn() } as unknown as jest.Mocked<ListPromotionsUseCase>;

    const moduleRef = await Test.createTestingModule({
      controllers: [PromotionsController],
      providers: [
        { provide: CreatePromotionUseCase, useValue: createPromotion },
        { provide: UpdatePromotionUseCase, useValue: updatePromotion },
        { provide: FindPromotionByIdUseCase, useValue: findPromotionById },
        { provide: ListPromotionsUseCase, useValue: listPromotions },
      ],
    }).compile();

    controller = moduleRef.get(PromotionsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('maps the created promotion to its response DTO', async () => {
      createPromotion.execute.mockResolvedValue(buildPromotion('promo-9'));

      const body = {
        businessUnitId: 'bu-1',
        name: 'Almoço',
        discountType: DiscountType.PERCENTAGE,
        discountValue: '10.00',
        minOrderValue: '30.00',
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: new Date('2026-06-30T00:00:00.000Z'),
      } satisfies CreatePromotionDto;

      const response = await controller.create(body);

      expect(createPromotion.execute).toHaveBeenCalledWith(body);
      expect(response).toBeInstanceOf(PromotionResponseDto);
      expect(response.id).toBe('promo-9');
      expect(response.discountValue).toBe('10.00');
    });
  });

  describe('findByBusinessUnit', () => {
    it('clamps the limit, forwards the cursor and returns a paginated envelope', async () => {
      listPromotions.execute.mockResolvedValue({
        data: [buildPromotion()],
        meta: { limit: 100, hasMore: false, nextCursor: null },
      });

      const response = await controller.findByBusinessUnit(
        { businessUnitId: 'bu-1' },
        { limit: 99999, cursor: 'c-1' },
      );

      expect(listPromotions.execute).toHaveBeenCalledWith({
        businessUnitId: 'bu-1',
        cursor: 'c-1',
        limit: 100,
      });
      expect(response).toBeInstanceOf(PaginatedResponseDto);
      expect(response.data[0]).toBeInstanceOf(PromotionResponseDto);
    });
  });

  describe('findById', () => {
    it('returns the mapped DTO when the promotion exists', async () => {
      findPromotionById.execute.mockResolvedValue(buildPromotion('promo-42'));

      const response = await controller.findById({ promotionId: 'promo-42' });

      expect(findPromotionById.execute).toHaveBeenCalledWith('promo-42');
      expect(response.id).toBe('promo-42');
    });

    it('propagates PromotionNotFoundError from the use case', async () => {
      findPromotionById.execute.mockRejectedValue(new PromotionNotFoundError('not found'));

      await expect(controller.findById({ promotionId: 'missing' })).rejects.toBeInstanceOf(
        PromotionNotFoundError,
      );
    });
  });

  describe('update', () => {
    it('forwards the id and patch and returns the mapped DTO', async () => {
      updatePromotion.execute.mockResolvedValue(buildPromotion('promo-1'));

      const response = await controller.update({ promotionId: 'promo-1' }, { isActive: false });

      expect(updatePromotion.execute).toHaveBeenCalledWith('promo-1', { isActive: false });
      expect(response).toBeInstanceOf(PromotionResponseDto);
    });
  });
});
