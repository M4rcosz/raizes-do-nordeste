import { Inject, Injectable } from '@nestjs/common';
import {
  MENU_ITEM_REPOSITORY,
  type MenuItemRepository,
  type MenuItemWithProduct,
} from '../../domain/repositories/menu-item.repository';
import { MenuItemsFetchError } from '../errors/menu-items-fetch.error';
import { MenuItemNotFoundError } from '../errors/menu-item-not-found.error';

@Injectable()
export class GetMenuItemByIdUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY)
    private readonly menuItems: MenuItemRepository,
  ) {}

  async execute(menuItemId: string, businessUnitId: string): Promise<MenuItemWithProduct> {
    let item: MenuItemWithProduct | null;

    try {
      item = await this.menuItems.findAvailableById(menuItemId, businessUnitId);
    } catch (err) {
      throw new MenuItemsFetchError(
        `Could not retrieve menu item "${menuItemId}" for business unit "${businessUnitId}".`,
        { cause: err },
      );
    }

    if (!item) {
      throw new MenuItemNotFoundError(
        `Menu item with id "${menuItemId}" not found in business unit "${businessUnitId}".`,
      );
    }

    return item;
  }
}
