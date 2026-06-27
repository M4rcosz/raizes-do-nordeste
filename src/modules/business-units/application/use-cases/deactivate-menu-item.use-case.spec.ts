import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Money } from '@shared/domain/value-objects/money';
import {
  MenuItemRepository,
  MENU_ITEM_REPOSITORY,
} from '../../domain/repositories/menu-item.repository';
import { DeactivateMenuItemUseCase } from './deactivate-menu-item.use-case';
import { MenuItem } from '../../domain/entities/menu-item.entity';
import { MenuItemNotFoundError } from '../errors/menu-item-not-found.error';

describe('DeactivateMenuItemUseCase', () => {
  let useCase: DeactivateMenuItemUseCase;
  let update: jest.MockedFunction<MenuItemRepository['update']>;

  beforeAll(async () => {
    update = jest.fn() as jest.MockedFunction<MenuItemRepository['update']>;

    const mockRepo: jest.Mocked<MenuItemRepository> = {
      findAvailableById: jest.fn(),
      findAllByBusinessUnit: jest.fn(),
      create: jest.fn(),
      update,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [DeactivateMenuItemUseCase, { provide: MENU_ITEM_REPOSITORY, useValue: mockRepo }],
    }).compile();

    useCase = moduleRef.get(DeactivateMenuItemUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should flip isAvailable to false via a unit-scoped update', async () => {
      const updated = new MenuItem(
        'menu-item-1',
        'bu-1',
        'product-1',
        Money.fromDecimalString('15.90'),
        false,
        new Date(),
        new Date(),
      );
      update.mockResolvedValue(updated);

      const result = await useCase.execute('menu-item-1', 'bu-1');

      expect(update).toHaveBeenCalledWith({
        id: 'menu-item-1',
        businessUnitId: 'bu-1',
        isAvailable: false,
      });
      expect(result).toBe(updated);
    });

    it('should throw MenuItemNotFoundError when no matching item exists', async () => {
      update.mockResolvedValue(null);

      await expect(useCase.execute('missing', 'bu-1')).rejects.toBeInstanceOf(
        MenuItemNotFoundError,
      );
    });
  });
});
