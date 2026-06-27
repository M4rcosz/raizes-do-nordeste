import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Money } from '@shared/domain/value-objects/money';
import {
  type CreateMenuItemInput,
  MenuItemRepository,
  MENU_ITEM_REPOSITORY,
} from '../../domain/repositories/menu-item.repository';
import { AddMenuItemUseCase } from './add-menu-item.use-case';
import { MenuItem } from '../../domain/entities/menu-item.entity';
import { MenuItemAlreadyExistsError } from '../../domain/errors/menu-item-already-exists.error';

describe('AddMenuItemUseCase', () => {
  let useCase: AddMenuItemUseCase;
  let create: jest.MockedFunction<MenuItemRepository['create']>;

  const input: CreateMenuItemInput = {
    businessUnitId: 'bu-1',
    productId: 'product-1',
    customPrice: '15.90',
  };

  beforeAll(async () => {
    create = jest.fn() as jest.MockedFunction<MenuItemRepository['create']>;

    const mockRepo: jest.Mocked<MenuItemRepository> = {
      findAvailableById: jest.fn(),
      findAllByBusinessUnit: jest.fn(),
      create,
      update: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [AddMenuItemUseCase, { provide: MENU_ITEM_REPOSITORY, useValue: mockRepo }],
    }).compile();

    useCase = moduleRef.get(AddMenuItemUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should delegate to the repository and return the created menu item', async () => {
      const created = new MenuItem(
        'menu-item-1',
        input.businessUnitId,
        input.productId,
        Money.fromDecimalString(input.customPrice),
        true,
        new Date(),
        new Date(),
      );
      create.mockResolvedValue(created);

      const result = await useCase.execute(input);

      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith(input);
      expect(result).toBe(created);
    });

    it('should propagate domain errors raised by the repository', async () => {
      const domainError = new MenuItemAlreadyExistsError(
        'Product "product-1" is already on the menu.',
      );
      create.mockRejectedValue(domainError);

      await expect(useCase.execute(input)).rejects.toBe(domainError);
    });
  });
});
