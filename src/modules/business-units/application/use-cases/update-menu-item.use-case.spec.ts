import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Money } from '@shared/domain/value-objects/money';
import {
  type UpdateMenuItemInput,
  MenuItemRepository,
  MENU_ITEM_REPOSITORY,
} from '../../domain/repositories/menu-item.repository';
import { UpdateMenuItemUseCase } from './update-menu-item.use-case';
import { MenuItem } from '../../domain/entities/menu-item.entity';
import { MenuItemNotFoundError } from '../errors/menu-item-not-found.error';

describe('UpdateMenuItemUseCase', () => {
  let useCase: UpdateMenuItemUseCase;
  let update: jest.MockedFunction<MenuItemRepository['update']>;

  const input: UpdateMenuItemInput = {
    id: 'menu-item-1',
    businessUnitId: 'bu-1',
    customPrice: '19.90',
    isAvailable: false,
  };

  beforeAll(async () => {
    update = jest.fn() as jest.MockedFunction<MenuItemRepository['update']>;

    const mockRepo: jest.Mocked<MenuItemRepository> = {
      findAvailableById: jest.fn(),
      findAllByBusinessUnit: jest.fn(),
      create: jest.fn(),
      update,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [UpdateMenuItemUseCase, { provide: MENU_ITEM_REPOSITORY, useValue: mockRepo }],
    }).compile();

    useCase = moduleRef.get(UpdateMenuItemUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should forward the patch to the repository and return the updated item', async () => {
      const updated = new MenuItem(
        'menu-item-1',
        'bu-1',
        'product-1',
        Money.fromDecimalString('19.90'),
        false,
        new Date(),
        new Date(),
      );
      update.mockResolvedValue(updated);

      const result = await useCase.execute(input);

      expect(update).toHaveBeenCalledWith(input);
      expect(result).toBe(updated);
    });

    it('should throw MenuItemNotFoundError when no matching item exists', async () => {
      update.mockResolvedValue(null);

      await expect(useCase.execute(input)).rejects.toBeInstanceOf(MenuItemNotFoundError);
    });
  });
});
