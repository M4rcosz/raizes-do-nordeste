import { Inject, Injectable } from '@nestjs/common';
import {
  MENU_ITEM_REPOSITORY,
  type MenuItemRepository,
  type MenuItemWithProduct,
} from '../../domain/repositories/menu-item.repository';
import { MenuItemsFetchError } from '../errors/menu-items-fetch.error';
import { CursorPaginatedResult, buildCursorMeta } from '@shared/pagination/pagination';
import { decodeCatalogCursor, encodeCatalogCursor } from '../catalog-keyset-cursor';

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

    // Decode before the fetch: a malformed token is the caller's error (422), not a
    // repository failure, and must not surface as an outage.
    const keyset = cursor === undefined ? undefined : decodeCatalogCursor(cursor);

    let items: MenuItemWithProduct[];
    try {
      items = await this.menuItems.findAllByBusinessUnit({
        businessUnitId,
        take: limit + 1,
        keyset,
        includeUnavailable,
      });
    } catch (err) {
      throw new MenuItemsFetchError(
        `Could not retrieve the menu for business unit "${businessUnitId}".`,
        { cause: err },
      );
    }

    // Trimmed by hand rather than with buildCursorPage: the row here is a read model
    // whose id sits under .menuItem, not at the top level.
    const hasMore = items.length > limit;
    const trimmed = hasMore ? items.slice(0, limit) : items;
    const last = trimmed[trimmed.length - 1];
    const nextCursor =
      last === undefined
        ? undefined
        : encodeCatalogCursor(last.menuItem.createdAt, last.menuItem.id);

    return {
      data: trimmed,
      meta: buildCursorMeta(limit, hasMore, nextCursor),
    };
  }
}
