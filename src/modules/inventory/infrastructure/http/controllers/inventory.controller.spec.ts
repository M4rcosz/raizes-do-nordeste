import { describe, expect, it } from '@jest/globals';
import { Reflector } from '@nestjs/core';
import { InventoryController } from './inventory.controller';
import { UnitScopeGuard } from '@shared/auth/unit-scope.guard';
import { ScopedToBusinessUnit } from '@shared/auth/scoped-to-business-unit.decorator';

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
