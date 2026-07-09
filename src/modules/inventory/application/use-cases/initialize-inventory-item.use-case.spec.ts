import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { InitializeInventoryItemUseCase } from './initialize-inventory-item.use-case';
import type { InventoryRepository } from '../../domain/repositories/inventory.repository';
import { Inventory } from '../../domain/entities/inventory.entity';
import { InventoryAlreadyExistsError } from '../../domain/errors/inventory-already-exists.error';
import type { TransactionRunner } from '@shared/transaction/transaction-runner.port';
import type { AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';

const TX = Symbol('tx');

describe('InitializeInventoryItemUseCase', () => {
  let initialize: jest.MockedFunction<InventoryRepository['initialize']>;
  let auditLog: jest.MockedFunction<AuditLogger['log']>;
  let useCase: InitializeInventoryItemUseCase;

  const created = new Inventory('inv-1', 'bu-1', 'p-1', 10, 2, new Date(), new Date());

  beforeEach(() => {
    initialize = jest.fn() as jest.MockedFunction<InventoryRepository['initialize']>;
    initialize.mockResolvedValue(created);

    const repo: InventoryRepository = {
      findManyByUnit: jest.fn() as jest.MockedFunction<InventoryRepository['findManyByUnit']>,
      applyMovement: jest.fn() as jest.MockedFunction<InventoryRepository['applyMovement']>,
      initialize,
    };
    // Fake unit of work: runs the work immediately, handing it a sentinel tx
    // so tests can assert the same context reaches the repository.
    const transactions: TransactionRunner = { run: (work) => work(TX) };

    auditLog = jest.fn() as jest.MockedFunction<AuditLogger['log']>;
    auditLog.mockResolvedValue(undefined);
    const audit: AuditLogger = { log: auditLog };

    useCase = new InitializeInventoryItemUseCase(repo, transactions, audit);
  });

  it('creates the row inside a transaction with the actor as createdBy', async () => {
    const result = await useCase.execute(
      {
        businessUnitId: 'bu-1',
        productId: 'p-1',
        quantity: 10,
        minQuantity: 2,
        reason: 'opening stock',
      },
      'manager-1',
    );

    expect(initialize).toHaveBeenCalledWith(
      {
        businessUnitId: 'bu-1',
        productId: 'p-1',
        quantity: 10,
        minQuantity: 2,
        reason: 'opening stock',
        createdBy: 'manager-1',
      },
      TX,
    );
    expect(result).toBe(created);
  });

  it('propagates repository errors so the transaction rolls back', async () => {
    initialize.mockRejectedValue(new InventoryAlreadyExistsError('already exists'));

    await expect(
      useCase.execute(
        {
          businessUnitId: 'bu-1',
          productId: 'p-1',
          quantity: 0,
          minQuantity: 2,
          reason: 'opening stock',
        },
        'manager-1',
      ),
    ).rejects.toBeInstanceOf(InventoryAlreadyExistsError);
  });

  it('records who seeded the row, since a zero balance writes no ledger entry', async () => {
    await useCase.execute(
      {
        businessUnitId: 'bu-1',
        productId: 'p-1',
        quantity: 10,
        minQuantity: 2,
        reason: 'opening stock',
      },
      'manager-1',
    );

    expect(auditLog).toHaveBeenCalledWith({
      userId: 'manager-1',
      action: AUDIT_ACTIONS.INVENTORY_ITEM_INITIALIZED,
      entity: 'Inventory',
      entityId: 'inv-1',
      metadata: {
        businessUnitId: 'bu-1',
        productId: 'p-1',
        quantity: 10,
        minQuantity: 2,
        reason: 'opening stock',
      },
    });
  });

  it('does not audit a write that rolled back', async () => {
    initialize.mockRejectedValue(new InventoryAlreadyExistsError('already exists'));

    await expect(
      useCase.execute(
        {
          businessUnitId: 'bu-1',
          productId: 'p-1',
          quantity: 10,
          minQuantity: 2,
          reason: 'opening stock',
        },
        'manager-1',
      ),
    ).rejects.toBeInstanceOf(InventoryAlreadyExistsError);

    expect(auditLog).not.toHaveBeenCalled();
  });
});
