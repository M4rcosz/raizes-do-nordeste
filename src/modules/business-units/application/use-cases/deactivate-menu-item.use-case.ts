import { Inject, Injectable } from '@nestjs/common';
import { MenuItem } from '../../domain/entities/menu-item.entity';
import {
  MENU_ITEM_REPOSITORY,
  type MenuItemRepository,
} from '../../domain/repositories/menu-item.repository';
import { MenuItemNotFoundError } from '../errors/menu-item-not-found.error';

@Injectable()
export class DeactivateMenuItemUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY)
    private readonly menuItems: MenuItemRepository,
  ) {}

  async execute(menuItemId: string, businessUnitId: string): Promise<MenuItem> {
    const updated = await this.menuItems.update({
      id: menuItemId,
      businessUnitId,
      isAvailable: false,
    });

    if (!updated) {
      throw new MenuItemNotFoundError(
        `Menu item with id "${menuItemId}" not found in business unit "${businessUnitId}".`,
      );
    }

    return updated;
  }
}
