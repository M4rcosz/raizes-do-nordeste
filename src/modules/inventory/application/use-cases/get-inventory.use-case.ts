import { Inject, Injectable } from '@nestjs/common';
import { Inventory } from '../../domain/entities/inventory.entity';
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
} from '../../domain/repositories/inventory.repository';
import { InventoryFetchError } from '../errors/inventory-fetch.error';

@Injectable()
export class GetInventoryUseCase {
  constructor(
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventories: InventoryRepository,
  ) {}

  async execute(businessUnitId: string): Promise<Inventory[]> {
    try {
      return await this.inventories.findByUnit(businessUnitId);
    } catch (err) {
      throw new InventoryFetchError('Could not retrieve the unit inventory.', { cause: err });
    }
  }
}
