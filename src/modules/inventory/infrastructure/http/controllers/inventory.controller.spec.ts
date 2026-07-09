import { describe, expect, it, jest } from '@jest/globals';
import { Reflector } from '@nestjs/core';
import { InventoryController } from './inventory.controller';
import { UnitScopeGuard } from '@shared/auth/unit-scope.guard';
import { ScopedToBusinessUnit } from '@shared/auth/scoped-to-business-unit.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { GetInventoryUseCase } from '@modules/inventory/application/use-cases/get-inventory.use-case';
import { AdjustInventoryUseCase } from '@modules/inventory/application/use-cases/adjust-inventory.use-case';
import { InitializeInventoryItemUseCase } from '@modules/inventory/application/use-cases/initialize-inventory-item.use-case';
import { Inventory } from '@modules/inventory/domain/entities/inventory.entity';

// Behavioral isolation lives in unit-scope.guard.spec. Here we only assert the
// guard and the param binding are actually wired onto the controller, since a
// missing decorator would silently disable the unit check.
describe('InventoryController unit scoping', () => {
  const reflector = new Reflector();

  it('binds UnitScopeGuard to the controller', () => {
    const guards = Reflect.getMetadata('__guards__', InventoryController) as unknown[] | undefined;
    expect(guards).toContain(UnitScopeGuard);
  });

  it('scopes to the :businessUnitId route param', () => {
    expect(reflector.get(ScopedToBusinessUnit, InventoryController)).toBe('businessUnitId');
  });
});

describe('InventoryController.initialize', () => {
  it('calls the use case with the unit-scoped command and the actor id', async () => {
    const created = new Inventory('inv-1', 'bu-1', 'p-1', 10, 2, new Date(), new Date());
    const execute = jest.fn<InitializeInventoryItemUseCase['execute']>().mockResolvedValue(created);
    const useCase = { execute } as unknown as InitializeInventoryItemUseCase;

    const controller = new InventoryController(
      {} as GetInventoryUseCase,
      {} as AdjustInventoryUseCase,
      useCase,
    );

    const body = { productId: 'p-1', quantity: 10, minQuantity: 2, reason: 'opening stock' };
    const result = await controller.initialize({ businessUnitId: 'bu-1' }, body, {
      sub: 'manager-1',
    } as JwtPayload);

    expect(execute).toHaveBeenCalledWith({ businessUnitId: 'bu-1', ...body }, 'manager-1');
    expect(result.id).toBe('inv-1');
  });
});
