import { MenuItem } from '../entities/menu-item.entity';
import { CursorPaginationParams } from '@shared/pagination/pagination';

/**
 * Read model pairing a menu item with the public-facing product fields it
 * exposes. Used by the public endpoints so the catalog can be rendered without
 * reaching into the Product context's entity.
 */
export interface MenuItemWithProduct {
  menuItem: MenuItem;
  product: {
    id: string;
    name: string;
    description: string | null;
    imageUrl: string;
  };
}

export interface FindMenuItemsByBusinessUnitInput {
  businessUnitId: string;
  pagination: CursorPaginationParams;
  /**
   * Management view. When true, returns every item regardless of its
   * availability flag or the product/unit active flags. Defaults to the public
   * view (available only).
   */
  includeUnavailable?: boolean;
}

export interface CreateMenuItemInput {
  businessUnitId: string;
  productId: string;
  customPrice: string;
  isAvailable?: boolean;
}

export interface UpdateMenuItemInput {
  id: string;
  businessUnitId: string;
  customPrice?: string;
  isAvailable?: boolean;
}

export interface MenuItemRepository {
  /**
   * Single item for the public path: scoped to the unit and only when the item,
   * its product and the unit are all active. Returns null otherwise so callers
   * cannot tell an unavailable item from a missing one.
   */
  findAvailableById(
    menuItemId: string,
    businessUnitId: string,
  ): Promise<MenuItemWithProduct | null>;
  /**
   * Cursor-paginated listing. The public path filters to available items; the
   * management path (`includeUnavailable`) returns the full set.
   */
  findAllByBusinessUnit(input: FindMenuItemsByBusinessUnitInput): Promise<MenuItemWithProduct[]>;
  create(input: CreateMenuItemInput): Promise<MenuItem>;
  /**
   * Partial update scoped to the owning unit. Returns null when no matching
   * item exists for the (id, businessUnitId) pair.
   */
  update(input: UpdateMenuItemInput): Promise<MenuItem | null>;
}

export const MENU_ITEM_REPOSITORY = Symbol('MenuItemRepository');
