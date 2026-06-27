import { Inject, Injectable } from '@nestjs/common';
import {
  MENU_ITEM_REPOSITORY,
  type MenuItemRepository,
  type MenuItemWithProduct,
} from '../../domain/repositories/menu-item.repository';
import { MenuItemsFetchError } from '../errors/menu-items-fetch.error';
import { CursorPaginatedResult, buildCursorMeta } from '@shared/pagination/pagination';

export interface GetMenuByBusinessUnitInput {
  businessUnitId: string;
  cursor?: string;
  limit: number;
  includeUnavailable?: boolean;
}

@Injectable()
export class GetMenuByBusinessUnitUseCase {
  constructor(
    @Inject(MENU_ITEM_REPOSITORY)
    private readonly menuItems: MenuItemRepository,
  ) {}

  async execute(
    input: GetMenuByBusinessUnitInput,
  ): Promise<CursorPaginatedResult<MenuItemWithProduct>> {
    const { businessUnitId, cursor, limit, includeUnavailable } = input;

    let items: MenuItemWithProduct[];
    try {
      items = await this.menuItems.findAllByBusinessUnit({
        businessUnitId,
        pagination: { cursor, take: limit + 1 },
        includeUnavailable,
      });
    } catch (err) {
      throw new MenuItemsFetchError(
        `Could not retrieve the menu for business unit "${businessUnitId}".`,
        { cause: err },
      );
    }

    const hasMore = items.length > limit;
    const trimmed = hasMore ? items.slice(0, limit) : items;
    const lastItemId = trimmed[trimmed.length - 1]?.menuItem.id;

    return {
      data: trimmed,
      meta: buildCursorMeta(limit, hasMore, lastItemId),
    };
  }
}
