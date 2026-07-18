import type {
  BusinessUnitForAiView,
  BusinessUnitListForAiResult,
  CatalogForAi,
  CategoryForAiView,
  CategoryListForAiResult,
  MenuItemForAiView,
  MenuListForAiResult,
} from '@modules/business-units/application/ports/catalog-for-ai.port';

/** In-memory CatalogForAi fake. Returns what was seeded and records the args it got. */
export class FakeCatalogForAi implements CatalogForAi {
  private businessUnits: BusinessUnitForAiView[] = [];
  private categories: CategoryForAiView[] = [];
  private readonly menus = new Map<string, MenuItemForAiView[]>();
  readonly unitCalls: (string | undefined)[] = [];
  readonly categoryCalls: (string | undefined)[] = [];
  readonly menuCalls: string[] = [];
  hasMore = false;

  seedBusinessUnits(...units: BusinessUnitForAiView[]): this {
    this.businessUnits = units;
    return this;
  }

  seedCategories(...categories: CategoryForAiView[]): this {
    this.categories = categories;
    return this;
  }

  seedMenu(businessUnitId: string, ...items: MenuItemForAiView[]): this {
    this.menus.set(businessUnitId, items);
    return this;
  }

  listBusinessUnits(search?: string): Promise<BusinessUnitListForAiResult> {
    this.unitCalls.push(search);
    return Promise.resolve({ businessUnits: this.businessUnits, hasMore: this.hasMore });
  }

  listCategories(search?: string): Promise<CategoryListForAiResult> {
    this.categoryCalls.push(search);
    return Promise.resolve({ categories: this.categories, hasMore: this.hasMore });
  }

  listMenuItems(businessUnitId: string): Promise<MenuListForAiResult> {
    this.menuCalls.push(businessUnitId);
    return Promise.resolve({
      menuItems: this.menus.get(businessUnitId) ?? [],
      hasMore: this.hasMore,
    });
  }
}
