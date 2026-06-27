import { Inject, Injectable } from '@nestjs/common';
import { MenuItem } from '../../domain/entities/menu-item.entity';
import {
  MENU_ITEM_REPOSITORY,
  type MenuItemRepository,
  type UpdateMenuItemInput,
} from '../../domain/repositories/menu-item.repository';
import { MenuItemNotFoundError } from '../errors/menu-item-not-found.error';

@Injectable()
export class UpdateMenuItemUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY)
    private readonly menuItems: MenuItemRepository,
  ) {}

  async execute(input: UpdateMenuItemInput): Promise<MenuItem> {
    const updated = await this.menuItems.update(input);

    if (!updated) {
      throw new MenuItemNotFoundError(
        `Menu item with id "${input.id}" not found in business unit "${input.businessUnitId}".`,
      );
    }

    return updated;
  }
}
