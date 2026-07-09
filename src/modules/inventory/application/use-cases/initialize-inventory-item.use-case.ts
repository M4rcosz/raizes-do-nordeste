import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@shared/transaction/transaction-runner.port';
import { AUDIT_LOGGER, type AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { Inventory } from '../../domain/entities/inventory.entity';
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
} from '../../domain/repositories/inventory.repository';

export interface InitializeInventoryItemCommand {
  businessUnitId: string;
  productId: string;
  quantity: number;
  minQuantity: number;
  reason: string;
}

@Injectable()
export class InitializeInventoryItemUseCase {
  constructor(
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventories: InventoryRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  /**
   * Creates the first inventory row for a product at a unit. The row insert and
   * the opening IN ledger entry share one transaction, so a row can never land
   * without its ledger entry (or vice versa).
   */
  async execute(command: InitializeInventoryItemCommand, actorId: string): Promise<Inventory> {
    const created = await this.transactions.run((tx) =>
      this.inventories.initialize({ ...command, createdBy: actorId }, tx),
    );

    // Audited after the commit: this use case owns the transaction, so a log line
    // here can never describe a write that rolled back. A zero opening balance
    // writes no ledger entry, so this is the only record of who seeded the row.
    await this.audit.log({
      userId: actorId,
      action: AUDIT_ACTIONS.INVENTORY_ITEM_INITIALIZED,
      entity: 'Inventory',
      entityId: created.id,
      metadata: {
        businessUnitId: created.businessUnitId,
        productId: created.productId,
        quantity: created.quantity,
        minQuantity: created.minQuantity,
        reason: command.reason,
      },
    });

    return created;
  }
}
