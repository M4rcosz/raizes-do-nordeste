import { Inject, Injectable } from '@nestjs/common';
import {
  BUSINESS_UNIT_REPOSITORY,
  type BusinessUnitRepository,
} from '@modules/business-units/domain/repositories/business-unit.repository';
import {
  CATEGORY_REPOSITORY,
  type CategoryRepository,
} from '@modules/business-units/domain/repositories/category.repository';
import {
  MENU_ITEM_REPOSITORY,
  type MenuItemRepository,
  type MenuItemWithProduct,
} from '@modules/business-units/domain/repositories/menu-item.repository';
import type { BusinessUnit } from '@modules/business-units/domain/entities/business-unit.entity';
import type { Category } from '@modules/business-units/domain/entities/category.entity';
import { buildCursorPage } from '@shared/pagination/pagination';
import type {
  BusinessUnitForAiView,
  BusinessUnitListForAiResult,
  CatalogForAi,
  CategoryForAiView,
  CategoryListForAiResult,
  MenuItemForAiView,
  MenuListForAiResult,
} from '../ports/catalog-for-ai.port';

// Rows one AI listing may return. Small on purpose: every row is tokens metered
// against the caller's AI balance.
const AI_PAGE_SIZE = 10;

@Injectable()
export class CatalogForAiService implements CatalogForAi {
  constructor(
    @Inject(BUSINESS_UNIT_REPOSITORY)
    private readonly businessUnits: BusinessUnitRepository,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepository,
    @Inject(MENU_ITEM_REPOSITORY)
    private readonly menuItems: MenuItemRepository,
  ) {}

  async listBusinessUnits(search?: string): Promise<BusinessUnitListForAiResult> {
    // Active only: the assistant answers customer-facing questions, and a closed
    // unit is not an answer. Mirrors the public GET /business-units route.
    const items = await this.businessUnits.findMany({
      filters: { search, isActive: true },
      take: AI_PAGE_SIZE + 1,
    });
    const page = buildCursorPage(items, AI_PAGE_SIZE);
    return {
      businessUnits: page.data.map((unit) => CatalogForAiService.toUnitView(unit)),
      hasMore: page.meta.hasMore,
    };
  }

  async listCategories(search?: string): Promise<CategoryListForAiResult> {
    const items = await this.categories.findAllActive({
      filters: { search },
      take: AI_PAGE_SIZE + 1,
    });
    const page = buildCursorPage(items, AI_PAGE_SIZE);
    return {
      categories: page.data.map((category) => CatalogForAiService.toCategoryView(category)),
      hasMore: page.meta.hasMore,
    };
  }

  async listMenuItems(businessUnitId: string): Promise<MenuListForAiResult> {
    // includeUnavailable stays false: the assistant gets the public menu view, so it
    // can never offer a customer something the unit is not selling.
    const items = await this.menuItems.findAllByBusinessUnit({
      businessUnitId,
      take: AI_PAGE_SIZE + 1,
    });
    // buildCursorPage keys the cursor off `id`; a MenuItemWithProduct is a pair, so
    // map to the view (which has one) before paging.
    const views = items.map((row) => CatalogForAiService.toMenuView(row));
    const page = buildCursorPage(views, AI_PAGE_SIZE);
    return { menuItems: page.data, hasMore: page.meta.hasMore };
  }

  private static toUnitView(unit: BusinessUnit): BusinessUnitForAiView {
    return {
      id: unit.id,
      name: unit.name,
      address: unit.address,
      city: unit.city,
      phone: unit.phone,
    };
  }

  private static toCategoryView(category: Category): CategoryForAiView {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
    };
  }

  private static toMenuView(row: MenuItemWithProduct): MenuItemForAiView {
    return {
      id: row.menuItem.id,
      productId: row.product.id,
      productName: row.product.name,
      description: row.product.description,
      price: row.menuItem.customPrice.toDecimalString(),
    };
  }
}
