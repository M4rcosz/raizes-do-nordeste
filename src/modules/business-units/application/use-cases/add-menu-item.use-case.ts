import { Inject, Injectable } from '@nestjs/common';
import { MenuItem } from '../../domain/entities/menu-item.entity';
import {
  type CreateMenuItemInput,
  MENU_ITEM_REPOSITORY,
  type MenuItemRepository,
} from '../../domain/repositories/menu-item.repository';

@Injectable()
export class AddMenuItemUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY)
    private readonly menuItems: MenuItemRepository,
  ) {}

  execute(input: CreateMenuItemInput): Promise<MenuItem> {
    return this.menuItems.create(input);
  }
}
