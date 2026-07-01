import { Inject, Injectable } from '@nestjs/common';
import { buildCursorMeta, type CursorPaginatedResult } from '@shared/pagination/pagination';
import { Inventory } from '../../domain/entities/inventory.entity';
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
} from '../../domain/repositories/inventory.repository';
import { InventoryFetchError } from '../errors/inventory-fetch.error';

export interface ListInventoryInput {
  businessUnitId: string;
  cursor?: string;
  limit: number;
}

@Injectable()
export class GetInventoryUseCase {
  constructor(
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventories: InventoryRepository,
  ) {}

  async execute(input: ListInventoryInput): Promise<CursorPaginatedResult<Inventory>> {
    const { businessUnitId, cursor, limit } = input;

    // Over-fetch by one to detect a next page, same as the promotion/product listings.
    let items: Inventory[];
    try {
      items = await this.inventories.findManyByUnit({
        businessUnitId,
        pagination: { cursor, take: limit + 1 },
      });
    } catch (err) {
      throw new InventoryFetchError('Could not retrieve the unit inventory.', { cause: err });
    }

    const hasMore = items.length > limit;
    const trimmed = hasMore ? items.slice(0, limit) : items;
    const lastItemId = trimmed[trimmed.length - 1]?.id;

    return {
      data: trimmed,
      meta: buildCursorMeta(limit, hasMore, lastItemId),
    };
  }
}
