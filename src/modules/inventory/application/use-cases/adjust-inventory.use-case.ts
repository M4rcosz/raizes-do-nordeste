import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@shared/transaction/transaction-runner.port';
import { Inventory } from '../../domain/entities/inventory.entity';
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
} from '../../domain/repositories/inventory.repository';
import type { ManualMovementType } from '../../domain/value-objects/inventory-transaction-type';

export interface AdjustInventoryCommand {
  businessUnitId: string;
  productId: string;
  type: ManualMovementType;
  quantity: number;
  reason: string;
}

@Injectable()
export class AdjustInventoryUseCase {
  constructor(
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventories: InventoryRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
  ) {}

  /**
   * Applies a manual IN/OUT movement. The balance update and the
   * InventoryTransaction insert share one transaction, so the ledger can never
   * record a movement whose balance change did not land (or vice versa).
   */
  async execute(command: AdjustInventoryCommand, actorId: string): Promise<Inventory> {
    return this.transactions.run((tx) =>
      this.inventories.applyMovement({ ...command, createdBy: actorId }, tx),
    );
  }
}
