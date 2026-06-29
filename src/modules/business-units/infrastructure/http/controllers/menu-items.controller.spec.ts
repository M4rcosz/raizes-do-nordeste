import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { Money } from '@shared/domain/value-objects/money';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { UnitScopeGuard } from '@shared/auth/unit-scope.guard';
import { ScopedToBusinessUnit } from '@shared/auth/scoped-to-business-unit.decorator';
import { MenuItemsController } from './menu-items.controller';
import { GetMenuByBusinessUnitUseCase } from '../../../application/use-cases/get-menu-by-business-unit.use-case';
import { GetMenuItemByIdUseCase } from '../../../application/use-cases/get-menu-item-by-id.use-case';
import { AddMenuItemUseCase } from '../../../application/use-cases/add-menu-item.use-case';
import { UpdateMenuItemUseCase } from '../../../application/use-cases/update-menu-item.use-case';
import { DeactivateMenuItemUseCase } from '../../../application/use-cases/deactivate-menu-item.use-case';
import { ActivateMenuItemUseCase } from '../../../application/use-cases/activate-menu-item.use-case';
import { MenuItem } from '../../../domain/entities/menu-item.entity';
import { MenuItemWithProduct } from '../../../domain/repositories/menu-item.repository';
import { MenuItemResponseDto } from '../dto/menu-item-response.dto';
import { PublicMenuItemResponseDto } from '../dto/menu-item-public-response.dto';
import { MenuItemNotFoundError } from '../../../application/errors/menu-item-not-found.error';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';

const actor = { sub: 'admin-1' } as JwtPayload;

describe('MenuItemsController', () => {
  let controller: MenuItemsController;
  let getMenuByBusinessUnit: jest.Mocked<GetMenuByBusinessUnitUseCase>;
  let getMenuItemById: jest.Mocked<GetMenuItemByIdUseCase>;
  let addMenuItem: jest.Mocked<AddMenuItemUseCase>;
  let updateMenuItem: jest.Mocked<UpdateMenuItemUseCase>;
  let deactivateMenuItem: jest.Mocked<DeactivateMenuItemUseCase>;
  let activateMenuItem: jest.Mocked<ActivateMenuItemUseCase>;

  const buildMenuItem = (id = 'menu-item-1', isAvailable = true): MenuItem =>
    new MenuItem(
      id,
      'bu-1',
      'product-1',
      Money.fromDecimalString('18.50'),
      isAvailable,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );

  const buildReadModel = (id = 'menu-item-1'): MenuItemWithProduct => ({
    menuItem: buildMenuItem(id),
    product: {
      id: 'product-1',
      name: 'Moqueca',
      description: null,
      imageUrl: 'https://example.com/moqueca.jpg',
    },
  });

  beforeAll(async () => {
    getMenuByBusinessUnit = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetMenuByBusinessUnitUseCase>;
    getMenuItemById = { execute: jest.fn() } as unknown as jest.Mocked<GetMenuItemByIdUseCase>;
    addMenuItem = { execute: jest.fn() } as unknown as jest.Mocked<AddMenuItemUseCase>;
    updateMenuItem = { execute: jest.fn() } as unknown as jest.Mocked<UpdateMenuItemUseCase>;
    deactivateMenuItem = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DeactivateMenuItemUseCase>;
    activateMenuItem = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ActivateMenuItemUseCase>;

    const moduleRef = await Test.createTestingModule({
      controllers: [MenuItemsController],
      providers: [
        { provide: GetMenuByBusinessUnitUseCase, useValue: getMenuByBusinessUnit },
        { provide: GetMenuItemByIdUseCase, useValue: getMenuItemById },
        { provide: AddMenuItemUseCase, useValue: addMenuItem },
        { provide: UpdateMenuItemUseCase, useValue: updateMenuItem },
        { provide: DeactivateMenuItemUseCase, useValue: deactivateMenuItem },
        { provide: ActivateMenuItemUseCase, useValue: activateMenuItem },
      ],
    }).compile();

    controller = moduleRef.get(MenuItemsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findMenu', () => {
    it('should request the public view and map read models to public DTOs', async () => {
      getMenuByBusinessUnit.execute.mockResolvedValue({
        data: [buildReadModel()],
        meta: { limit: 20, hasMore: false, nextCursor: null },
      });

      const response = await controller.findMenu({ businessUnitId: 'bu-1' }, { limit: 20 });

      expect(getMenuByBusinessUnit.execute).toHaveBeenCalledWith({
        businessUnitId: 'bu-1',
        cursor: undefined,
        limit: 20,
      });
      expect(response).toBeInstanceOf(PaginatedResponseDto);
      expect(response.data[0]).toBeInstanceOf(PublicMenuItemResponseDto);
      expect(response.data[0].price).toBe('18.50');
    });

    it('should clamp out-of-range limits to MAX_LIMIT', async () => {
      getMenuByBusinessUnit.execute.mockResolvedValue({
        data: [],
        meta: { limit: 100, hasMore: false, nextCursor: null },
      });

      await controller.findMenu({ businessUnitId: 'bu-1' }, { limit: 99999 });

      expect(getMenuByBusinessUnit.execute).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
      );
    });
  });

  describe('findMenuForManagement', () => {
    it('should request the management view and map to internal DTOs', async () => {
      getMenuByBusinessUnit.execute.mockResolvedValue({
        data: [buildReadModel()],
        meta: { limit: 20, hasMore: false, nextCursor: null },
      });

      const response = await controller.findMenuForManagement(
        { businessUnitId: 'bu-1' },
        { limit: 20, cursor: 'cursor-id' },
      );

      expect(getMenuByBusinessUnit.execute).toHaveBeenCalledWith({
        businessUnitId: 'bu-1',
        cursor: 'cursor-id',
        limit: 20,
        includeUnavailable: true,
      });
      expect(response.data[0]).toBeInstanceOf(MenuItemResponseDto);
    });
  });

  describe('findMenuItem', () => {
    it('should return the public DTO when an available item exists', async () => {
      getMenuItemById.execute.mockResolvedValue(buildReadModel('menu-item-42'));

      const response = await controller.findMenuItem({
        businessUnitId: 'bu-1',
        menuItemId: 'menu-item-42',
      });

      expect(getMenuItemById.execute).toHaveBeenCalledWith('menu-item-42', 'bu-1');
      expect(response).toBeInstanceOf(PublicMenuItemResponseDto);
      expect(response.menuItemId).toBe('menu-item-42');
    });

    it('should propagate MenuItemNotFoundError raised by the use-case', async () => {
      getMenuItemById.execute.mockRejectedValue(new MenuItemNotFoundError('Menu item not found.'));

      await expect(
        controller.findMenuItem({ businessUnitId: 'bu-1', menuItemId: 'missing' }),
      ).rejects.toBeInstanceOf(MenuItemNotFoundError);
    });
  });

  describe('addItem', () => {
    it('should build the create input from the route param and body, then map the result', async () => {
      addMenuItem.execute.mockResolvedValue(buildMenuItem('menu-item-7'));

      const response = await controller.addItem(
        { businessUnitId: 'bu-1' },
        { productId: 'product-1', customPrice: '18.50', isAvailable: true },
      );

      expect(addMenuItem.execute).toHaveBeenCalledWith({
        businessUnitId: 'bu-1',
        productId: 'product-1',
        customPrice: '18.50',
        isAvailable: true,
      });
      expect(response).toBeInstanceOf(MenuItemResponseDto);
      expect(response.id).toBe('menu-item-7');
    });
  });

  describe('updateItem', () => {
    it('should build the patch from params and body, then map the result', async () => {
      updateMenuItem.execute.mockResolvedValue(buildMenuItem('menu-item-1', false));

      const response = await controller.updateItem(
        { businessUnitId: 'bu-1', menuItemId: 'menu-item-1' },
        { customPrice: '19.90', isAvailable: false },
      );

      expect(updateMenuItem.execute).toHaveBeenCalledWith({
        id: 'menu-item-1',
        businessUnitId: 'bu-1',
        customPrice: '19.90',
        isAvailable: false,
      });
      expect(response).toBeInstanceOf(MenuItemResponseDto);
      expect(response.isAvailable).toBe(false);
    });
  });

  describe('deactivateItem', () => {
    it('should forward ids to the use-case and map the result', async () => {
      deactivateMenuItem.execute.mockResolvedValue(buildMenuItem('menu-item-1', false));

      const response = await controller.deactivateItem(actor, {
        businessUnitId: 'bu-1',
        menuItemId: 'menu-item-1',
      });

      expect(deactivateMenuItem.execute).toHaveBeenCalledWith('menu-item-1', 'bu-1', 'admin-1');
      expect(response.isAvailable).toBe(false);
    });
  });

  describe('activateItem', () => {
    it('should forward ids to the use-case and map the result', async () => {
      activateMenuItem.execute.mockResolvedValue(buildMenuItem('menu-item-1', true));

      const response = await controller.activateItem(actor, {
        businessUnitId: 'bu-1',
        menuItemId: 'menu-item-1',
      });

      expect(activateMenuItem.execute).toHaveBeenCalledWith('menu-item-1', 'bu-1', 'admin-1');
      expect(response.isAvailable).toBe(true);
    });
  });
});

// Behavioral isolation lives in unit-scope.guard.spec. Here we only assert the
// guard and the :businessUnitId binding are wired onto the management handlers
// and stay off the @Public read handlers (which carry no principal).
describe('MenuItemsController unit scoping', () => {
  const reflector = new Reflector();
  const proto = MenuItemsController.prototype;

  const isUnitScoped = (handler: (...args: never[]) => unknown): boolean => {
    const guards = (Reflect.getMetadata('__guards__', handler) ?? []) as unknown[];
    return (
      guards.includes(UnitScopeGuard) &&
      reflector.get(ScopedToBusinessUnit, handler) === 'businessUnitId'
    );
  };

  it.each([
    ['findMenuForManagement', proto.findMenuForManagement],
    ['addItem', proto.addItem],
    ['updateItem', proto.updateItem],
    ['deactivateItem', proto.deactivateItem],
    ['activateItem', proto.activateItem],
  ])('scopes the management route %s to the unit', (_name, handler) => {
    expect(isUnitScoped(handler)).toBe(true);
  });

  it.each([
    ['findMenu', proto.findMenu],
    ['findMenuItem', proto.findMenuItem],
  ])('leaves the public read route %s unscoped', (_name, handler) => {
    expect(isUnitScoped(handler)).toBe(false);
  });
});
