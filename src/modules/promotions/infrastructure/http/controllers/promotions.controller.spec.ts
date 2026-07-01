import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Money } from '@shared/domain/value-objects/money';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { PromotionsController } from './promotions.controller';
import { CreatePromotionUseCase } from '@modules/promotions/application/use-cases/create-promotion.use-case';
import { UpdatePromotionUseCase } from '@modules/promotions/application/use-cases/update-promotion.use-case';
import { FindPromotionByIdUseCase } from '@modules/promotions/application/use-cases/find-promotion-by-id.use-case';
import { ListPromotionsUseCase } from '@modules/promotions/application/use-cases/list-promotions.use-case';
import { ActivatePromotionUseCase } from '@modules/promotions/application/use-cases/activate-promotion.use-case';
import { DeactivatePromotionUseCase } from '@modules/promotions/application/use-cases/deactivate-promotion.use-case';
import { Promotion } from '@modules/promotions/domain/entities/promotion.entity';
import { DiscountType } from '@modules/promotions/domain/value-objects/discount-type';
import { PromotionResponseDto } from '../dto/promotion-response.dto';
import { PromotionNotFoundError } from '@modules/promotions/application/errors/promotion-not-found.error';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import type { PromotionActor } from '@modules/promotions/application/promotion-actor';
import type { CreatePromotionDto } from '../dto/create-promotion.dto';

// A scoped manager principal as AuthGuard would attach it.
const principal: JwtPayload = {
  sub: 'user-1',
  username: 'manager',
  role: UserRole.MANAGER,
  businessUnitIds: ['bu-1'],
  iat: 0,
  exp: 0,
};
const actor: PromotionActor = { role: UserRole.MANAGER, businessUnitIds: ['bu-1'] };

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
  let activatePromotion: jest.Mocked<ActivatePromotionUseCase>;
  let deactivatePromotion: jest.Mocked<DeactivatePromotionUseCase>;

  beforeAll(async () => {
    createPromotion = { execute: jest.fn() } as unknown as jest.Mocked<CreatePromotionUseCase>;
    updatePromotion = { execute: jest.fn() } as unknown as jest.Mocked<UpdatePromotionUseCase>;
    findPromotionById = { execute: jest.fn() } as unknown as jest.Mocked<FindPromotionByIdUseCase>;
    listPromotions = { execute: jest.fn() } as unknown as jest.Mocked<ListPromotionsUseCase>;
    activatePromotion = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ActivatePromotionUseCase>;
    deactivatePromotion = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DeactivatePromotionUseCase>;

    const moduleRef = await Test.createTestingModule({
      controllers: [PromotionsController],
      providers: [
        { provide: CreatePromotionUseCase, useValue: createPromotion },
        { provide: UpdatePromotionUseCase, useValue: updatePromotion },
        { provide: FindPromotionByIdUseCase, useValue: findPromotionById },
        { provide: ListPromotionsUseCase, useValue: listPromotions },
        { provide: ActivatePromotionUseCase, useValue: activatePromotion },
        { provide: DeactivatePromotionUseCase, useValue: deactivatePromotion },
      ],
    }).compile();

    controller = moduleRef.get(PromotionsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('forwards the body (with target unit) and actor and maps the created promotion to its response DTO', async () => {
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

      const response = await controller.create(body, principal);

      expect(createPromotion.execute).toHaveBeenCalledWith(body, actor);
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
    it('forwards the actor and returns the mapped DTO when the promotion exists', async () => {
      findPromotionById.execute.mockResolvedValue(buildPromotion('promo-42'));

      const response = await controller.findById({ promotionId: 'promo-42' }, principal);

      expect(findPromotionById.execute).toHaveBeenCalledWith('promo-42', actor);
      expect(response.id).toBe('promo-42');
    });

    it('propagates PromotionNotFoundError from the use case', async () => {
      findPromotionById.execute.mockRejectedValue(new PromotionNotFoundError('not found'));

      await expect(
        controller.findById({ promotionId: 'missing' }, principal),
      ).rejects.toBeInstanceOf(PromotionNotFoundError);
    });
  });

  describe('update', () => {
    it('forwards the id, patch and actor and returns the mapped DTO', async () => {
      updatePromotion.execute.mockResolvedValue(buildPromotion('promo-1'));

      const response = await controller.update(
        { promotionId: 'promo-1' },
        { isActive: false },
        principal,
      );

      expect(updatePromotion.execute).toHaveBeenCalledWith('promo-1', { isActive: false }, actor);
      expect(response).toBeInstanceOf(PromotionResponseDto);
    });
  });

  describe('activate', () => {
    it('forwards the id, actor and actor id and returns the mapped DTO', async () => {
      activatePromotion.execute.mockResolvedValue(buildPromotion('promo-1'));

      const response = await controller.activate({ promotionId: 'promo-1' }, principal);

      expect(activatePromotion.execute).toHaveBeenCalledWith('promo-1', actor, 'user-1');
      expect(response).toBeInstanceOf(PromotionResponseDto);
    });
  });

  describe('deactivate', () => {
    it('forwards the id, actor and actor id and returns the mapped DTO', async () => {
      deactivatePromotion.execute.mockResolvedValue(buildPromotion('promo-1'));

      const response = await controller.deactivate({ promotionId: 'promo-1' }, principal);

      expect(deactivatePromotion.execute).toHaveBeenCalledWith('promo-1', actor, 'user-1');
      expect(response).toBeInstanceOf(PromotionResponseDto);
    });
  });
});
