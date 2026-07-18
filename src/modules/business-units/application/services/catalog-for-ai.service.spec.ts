import { beforeEach, describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { BusinessUnit } from '@modules/business-units/domain/entities/business-unit.entity';
import { Category } from '@modules/business-units/domain/entities/category.entity';
import { MenuItem } from '@modules/business-units/domain/entities/menu-item.entity';
import type {
  BusinessUnitRepository,
  FindBusinessUnitsInput,
} from '@modules/business-units/domain/repositories/business-unit.repository';
import type {
  CategoryRepository,
  FindCategoriesInput,
} from '@modules/business-units/domain/repositories/category.repository';
import type {
  FindMenuItemsByBusinessUnitInput,
  MenuItemRepository,
  MenuItemWithProduct,
} from '@modules/business-units/domain/repositories/menu-item.repository';
import { CatalogForAiService } from './catalog-for-ai.service';

function unit(id: string): BusinessUnit {
  return new BusinessUnit(
    id,
    'Centro',
    '12345678000199',
    'Rua A, 100',
    'Recife',
    '81999999999',
    true,
    new Date(),
    new Date(),
  );
}

function category(id: string): Category {
  return new Category(id, 'Pratos', 'Pratos principais', true, new Date(), new Date());
}

function menuRow(id: string): MenuItemWithProduct {
  return {
    menuItem: new MenuItem(
      id,
      'bu-1',
      `product-${id}`,
      Money.fromDecimalString('32.00'),
      true,
      new Date(),
      new Date(),
    ),
    product: {
      id: `product-${id}`,
      name: 'Baiao de Dois',
      description: 'Arroz, feijao verde e queijo coalho',
      imageUrl: 'https://example.com/baiao.jpg',
    },
  };
}

class RecordingBusinessUnitRepository implements Pick<BusinessUnitRepository, 'findMany'> {
  lastInput?: FindBusinessUnitsInput;
  rows: BusinessUnit[] = [];

  findMany(input: FindBusinessUnitsInput): Promise<BusinessUnit[]> {
    this.lastInput = input;
    return Promise.resolve(this.rows);
  }
}

class RecordingCategoryRepository implements Pick<CategoryRepository, 'findAllActive'> {
  lastInput?: FindCategoriesInput;
  rows: Category[] = [];

  findAllActive(input: FindCategoriesInput): Promise<Category[]> {
    this.lastInput = input;
    return Promise.resolve(this.rows);
  }
}

class RecordingMenuItemRepository implements Pick<MenuItemRepository, 'findAllByBusinessUnit'> {
  lastInput?: FindMenuItemsByBusinessUnitInput;
  rows: MenuItemWithProduct[] = [];

  findAllByBusinessUnit(input: FindMenuItemsByBusinessUnitInput): Promise<MenuItemWithProduct[]> {
    this.lastInput = input;
    return Promise.resolve(this.rows);
  }
}

describe('CatalogForAiService', () => {
  let units: RecordingBusinessUnitRepository;
  let categories: RecordingCategoryRepository;
  let menu: RecordingMenuItemRepository;
  let service: CatalogForAiService;

  beforeEach(() => {
    units = new RecordingBusinessUnitRepository();
    categories = new RecordingCategoryRepository();
    menu = new RecordingMenuItemRepository();
    service = new CatalogForAiService(
      units as unknown as BusinessUnitRepository,
      categories as unknown as CategoryRepository,
      menu as unknown as MenuItemRepository,
    );
  });

  describe('listBusinessUnits', () => {
    it('asks only for active units and forwards the search term', async () => {
      units.rows = [unit('bu-1')];

      await service.listBusinessUnits('cen');

      expect(units.lastInput?.filters).toEqual({ search: 'cen', isActive: true });
    });

    it('never exposes the cnpj', async () => {
      units.rows = [unit('bu-1')];

      const [view] = (await service.listBusinessUnits()).businessUnits;

      expect(view).toEqual({
        id: 'bu-1',
        name: 'Centro',
        address: 'Rua A, 100',
        city: 'Recife',
        phone: '81999999999',
      });
      expect(view).not.toHaveProperty('cnpj');
    });

    it('over-fetches by one and reports hasMore without leaking the probe row', async () => {
      units.rows = Array.from({ length: 11 }, (_, i) => unit(`bu-${i}`));

      const result = await service.listBusinessUnits();

      expect(units.lastInput?.pagination.take).toBe(11);
      expect(result.businessUnits).toHaveLength(10);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('listCategories', () => {
    it('forwards the search term and maps the view', async () => {
      categories.rows = [category('cat-1')];

      const result = await service.listCategories('pra');

      expect(categories.lastInput?.filters).toEqual({ search: 'pra' });
      expect(result.categories).toEqual([
        { id: 'cat-1', name: 'Pratos', description: 'Pratos principais' },
      ]);
    });
  });

  describe('listMenuItems', () => {
    it('uses the public available-only view', async () => {
      menu.rows = [menuRow('mi-1')];

      await service.listMenuItems('bu-1');

      expect(menu.lastInput?.businessUnitId).toBe('bu-1');
      // Never true here: the assistant must not offer a customer an item the unit
      // is not currently selling.
      expect(menu.lastInput?.includeUnavailable).toBeFalsy();
    });

    it('flattens the item/product pair and keeps money a decimal string', async () => {
      menu.rows = [menuRow('mi-1')];

      const [view] = (await service.listMenuItems('bu-1')).menuItems;

      expect(view).toEqual({
        id: 'mi-1',
        productId: 'product-mi-1',
        productName: 'Baiao de Dois',
        description: 'Arroz, feijao verde e queijo coalho',
        price: '32.00',
      });
    });

    it('over-fetches by one and reports hasMore without leaking the probe row', async () => {
      menu.rows = Array.from({ length: 11 }, (_, i) => menuRow(`mi-${i}`));

      const result = await service.listMenuItems('bu-1');

      expect(menu.lastInput?.pagination.take).toBe(11);
      expect(result.menuItems).toHaveLength(10);
      expect(result.hasMore).toBe(true);
    });
  });
});
