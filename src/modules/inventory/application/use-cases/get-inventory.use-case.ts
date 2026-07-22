import { Inject, Injectable } from '@nestjs/common';
import { buildCursorPage, type CursorPaginatedResult } from '@shared/pagination/pagination';
import { Inventory } from '../../domain/entities/inventory.entity';
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
} from '../../domain/repositories/inventory.repository';
import { decodeInventoryCursor, encodeInventoryCursor } from '../inventory-keyset-cursor';
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

    // Decode before the fetch: a malformed token is the caller's error (422), not a
    // repository failure, and must not surface as an outage.
    const keyset = cursor === undefined ? undefined : decodeInventoryCursor(cursor);

    // Over-fetch by one to detect a next page, same as the promotion/product listings.
    let items: Inventory[];
    try {
      items = await this.inventories.findManyByUnit({
        businessUnitId,
        take: limit + 1,
        keyset,
      });
    } catch (err) {
      throw new InventoryFetchError('Could not retrieve the unit inventory.', { cause: err });
    }

    return buildCursorPage(items, limit, (inventory) =>
      encodeInventoryCursor(inventory.createdAt, inventory.id),
    );
  }
}
