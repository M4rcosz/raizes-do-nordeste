import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Money } from '@shared/domain/value-objects/money';
import { GetMenuByBusinessUnitUseCase } from './get-menu-by-business-unit.use-case';
import {
  MenuItemRepository,
  MENU_ITEM_REPOSITORY,
  type MenuItemWithProduct,
} from '../../domain/repositories/menu-item.repository';
import { MenuItem } from '../../domain/entities/menu-item.entity';
import { MenuItemsFetchError } from '../errors/menu-items-fetch.error';
import { encodeCatalogCursor } from '../catalog-keyset-cursor';

// Fixed so the expected page token is computable: the token is derived from the
// row's createdAt, not from its id.
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
const CURSOR = encodeCatalogCursor(CREATED_AT, 'last-id');

describe('GetMenuByBusinessUnitUseCase', () => {
  let useCase: GetMenuByBusinessUnitUseCase;
  let findAllByBusinessUnit: jest.MockedFunction<MenuItemRepository['findAllByBusinessUnit']>;

  const buildReadModel = (id: string): MenuItemWithProduct => ({
    menuItem: new MenuItem(
      id,
      'bu-1',
      `product-${id}`,
      Money.fromDecimalString('10.00'),
      true,
      CREATED_AT,
      CREATED_AT,
    ),
    product: {
      id: `product-${id}`,
      name: `Product ${id}`,
      description: null,
      imageUrl: 'https://example.com/img.jpg',
    },
  });

  beforeAll(async () => {
    findAllByBusinessUnit = jest.fn() as jest.MockedFunction<
      MenuItemRepository['findAllByBusinessUnit']
    >;

    const mockRepo: jest.Mocked<MenuItemRepository> = {
      findAvailableById: jest.fn(),
      findAllByBusinessUnit,
      create: jest.fn(),
      update: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        GetMenuByBusinessUnitUseCase,
        { provide: MENU_ITEM_REPOSITORY, useValue: mockRepo },
      ],
    }).compile();

    useCase = moduleRef.get(GetMenuByBusinessUnitUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should forward businessUnitId, cursor, take = limit + 1 and includeUnavailable', async () => {
      findAllByBusinessUnit.mockResolvedValue([]);

      await useCase.execute({
        businessUnitId: 'bu-1',
        limit: 5,
        cursor: CURSOR,
        includeUnavailable: true,
      });

      expect(findAllByBusinessUnit).toHaveBeenCalledWith({
        businessUnitId: 'bu-1',
        take: 6,
        keyset: { timestamp: CREATED_AT, id: 'last-id' },
        includeUnavailable: true,
      });
    });

    it('should trim the extra item and expose nextCursor by the menu item id when there is a next page', async () => {
      findAllByBusinessUnit.mockResolvedValue([
        buildReadModel('a'),
        buildReadModel('b'),
        buildReadModel('c'),
      ]);

      const result = await useCase.execute({ businessUnitId: 'bu-1', limit: 2 });

      expect(result.data.map((rm) => rm.menuItem.id)).toEqual(['a', 'b']);
      expect(result.meta).toEqual({
        limit: 2,
        hasMore: true,
        nextCursor: encodeCatalogCursor(CREATED_AT, 'b'),
      });
    });

    it('should return hasMore=false when fewer than limit + 1 items are returned', async () => {
      findAllByBusinessUnit.mockResolvedValue([buildReadModel('a')]);

      const result = await useCase.execute({ businessUnitId: 'bu-1', limit: 20 });

      expect(result.meta).toEqual({ limit: 20, hasMore: false, nextCursor: null });
    });

    it('should throw MenuItemsFetchError wrapping the original error when the repository fails', async () => {
      const dbError = new Error('DB error');
      findAllByBusinessUnit.mockRejectedValue(dbError);

      await expect(useCase.execute({ businessUnitId: 'bu-1', limit: 20 })).rejects.toBeInstanceOf(
        MenuItemsFetchError,
      );
      await expect(useCase.execute({ businessUnitId: 'bu-1', limit: 20 })).rejects.toMatchObject({
        cause: dbError,
      });
    });
  });
});
