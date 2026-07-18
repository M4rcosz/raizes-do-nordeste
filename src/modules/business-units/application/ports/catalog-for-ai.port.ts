export const CATALOG_FOR_AI = Symbol('CatalogForAi');

/** Read-only unit projection. No cnpj: it is the unit's fiscal identity, not chat material. */
export interface BusinessUnitForAiView {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
}

export interface CategoryForAiView {
  id: string;
  name: string;
  description: string | null;
}

/** A menu item paired with the product fields that make it readable to a human. */
export interface MenuItemForAiView {
  id: string;
  productId: string;
  productName: string;
  description: string | null;
  /** Decimal string, never a number: money stays exact from the entity to the wire. */
  price: string;
}

export interface BusinessUnitListForAiResult {
  businessUnits: BusinessUnitForAiView[];
  hasMore: boolean;
}

export interface CategoryListForAiResult {
  categories: CategoryForAiView[];
  hasMore: boolean;
}

export interface MenuListForAiResult {
  menuItems: MenuItemForAiView[];
  hasMore: boolean;
}

/**
 * Capability the business-units context publishes for the ai context: the public
 * catalog surface (units, categories, menu). All three reads are public-equivalent -
 * they expose only what the unauthenticated HTTP routes already do - so they are
 * available to every role and take no actor scope beyond the unit id.
 */
export interface CatalogForAi {
  /** Active units only, as the public route returns. */
  listBusinessUnits(search?: string): Promise<BusinessUnitListForAiResult>;
  /** Active categories only. */
  listCategories(search?: string): Promise<CategoryListForAiResult>;
  /** Available items only, at one unit - the public menu view. */
  listMenuItems(businessUnitId: string): Promise<MenuListForAiResult>;
}
