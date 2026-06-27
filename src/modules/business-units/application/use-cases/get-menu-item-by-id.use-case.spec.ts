import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Money } from '@shared/domain/value-objects/money';
import {
  MenuItemRepository,
  MENU_ITEM_REPOSITORY,
  type MenuItemWithProduct,
} from '../../domain/repositories/menu-item.repository';
import { GetMenuItemByIdUseCase } from './get-menu-item-by-id.use-case';
import { MenuItem } from '../../domain/entities/menu-item.entity';
import { MenuItemsFetchError } from '../errors/menu-items-fetch.error';
import { MenuItemNotFoundError } from '../errors/menu-item-not-found.error';

describe('GetMenuItemByIdUseCase', () => {
  let useCase: GetMenuItemByIdUseCase;
  let findAvailableById: jest.MockedFunction<MenuItemRepository['findAvailableById']>;

  const readModel: MenuItemWithProduct = {
    menuItem: new MenuItem(
      'menu-item-1',
      'bu-1',
      'product-1',
      Money.fromDecimalString('15.90'),
      true,
      new Date(),
      new Date(),
    ),
    product: {
      id: 'product-1',
      name: 'Moqueca',
      description: null,
      imageUrl: 'https://example.com/moqueca.jpg',
    },
  };

  beforeAll(async () => {
    findAvailableById = jest.fn() as jest.MockedFunction<MenuItemRepository['findAvailableById']>;

    const mockRepo: jest.Mocked<MenuItemRepository> = {
      findAvailableById,
      findAllByBusinessUnit: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [GetMenuItemByIdUseCase, { provide: MENU_ITEM_REPOSITORY, useValue: mockRepo }],
    }).compile();

    useCase = moduleRef.get(GetMenuItemByIdUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should return the read model when an available item exists', async () => {
      findAvailableById.mockResolvedValue(readModel);

      const result = await useCase.execute('menu-item-1', 'bu-1');

      expect(findAvailableById).toHaveBeenCalledWith('menu-item-1', 'bu-1');
      expect(result).toBe(readModel);
    });

    it('should throw MenuItemNotFoundError when the item is missing or unavailable', async () => {
      findAvailableById.mockResolvedValue(null);

      await expect(useCase.execute('missing', 'bu-1')).rejects.toBeInstanceOf(
        MenuItemNotFoundError,
      );
    });

    it('should throw MenuItemsFetchError wrapping the original error when the repository fails', async () => {
      const dbError = new Error('DB error');
      findAvailableById.mockRejectedValue(dbError);

      await expect(useCase.execute('menu-item-1', 'bu-1')).rejects.toBeInstanceOf(
        MenuItemsFetchError,
      );
      await expect(useCase.execute('menu-item-1', 'bu-1')).rejects.toMatchObject({
        cause: dbError,
      });
    });
  });
});
