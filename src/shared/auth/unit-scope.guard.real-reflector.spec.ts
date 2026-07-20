import { beforeAll, describe, expect, it } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Controller, ExecutionContext, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UnitScopeGuard } from './unit-scope.guard';
import { ScopedToBusinessUnit } from './scoped-to-business-unit.decorator';
import { JwtPayload } from './jwt-payload.type';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';

/**
 * Companion to unit-scope.guard.spec.ts, which mocks Reflector.getAllAndOverride and
 * feeds it a literal `undefined` for the no-argument decorator form. That assumption is
 * wrong: Reflector.createDecorator() invoked as @ScopedToBusinessUnit() stores {}, not
 * undefined. The mock hid a bug that 404'd every claim-only route for non-admin staff.
 *
 * So this suite uses the REAL Reflector against REAL decorated handlers. It is the only
 * place that pins what the decorator actually writes, and it must not be mocked.
 */
@Controller('probe')
class ProbeController {
  // Claim-only route: no unit in the path, the actor's claim is the whole scope.
  @ScopedToBusinessUnit()
  @Get('claim-only')
  claimOnly(): void {}

  // Param-scoped route: the unit id rides in the path.
  @ScopedToBusinessUnit('businessUnitId')
  @Get('by-unit/:businessUnitId')
  byUnit(): void {}

  // No decorator at all.
  @Get('unscoped')
  unscoped(): void {}
}

describe('UnitScopeGuard with the real Reflector', () => {
  let guard: UnitScopeGuard;
  let reflector: Reflector;

  const buildUser = (overrides?: { role?: UserRole; businessUnitIds?: string[] }): JwtPayload => ({
    sub: 'user-1',
    username: 'manager',
    role: overrides?.role ?? UserRole.MANAGER,
    businessUnitIds: overrides?.businessUnitIds ?? ['bu-1'],
    iat: 0,
    exp: 0,
  });

  const contextFor = (
    handler: keyof ProbeController,
    user: JwtPayload | undefined,
    params: Record<string, string> = {},
  ): ExecutionContext => {
    const request = { user, params };
    return {
      getHandler: () => ProbeController.prototype[handler],
      getClass: () => ProbeController,
      switchToHttp: (): { getRequest: () => typeof request } => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [UnitScopeGuard],
    }).compile();

    guard = moduleRef.get(UnitScopeGuard);
    reflector = moduleRef.get(Reflector);
  });

  it('documents that the no-argument decorator form does NOT store undefined', () => {
    // This is the fact the mocked spec got wrong. If Nest ever changes it to undefined
    // this test fails loudly and the guard's typeof check can be revisited.
    const stored = reflector.getAllAndOverride(ScopedToBusinessUnit, [
      ProbeController.prototype.claimOnly,
      ProbeController,
    ]);

    expect(stored).not.toBe('businessUnitId');
    expect(typeof stored).not.toBe('string');
  });

  it('stores the param name verbatim for the argument form', () => {
    const stored = reflector.getAllAndOverride(ScopedToBusinessUnit, [
      ProbeController.prototype.byUnit,
      ProbeController,
    ]);

    expect(stored).toBe('businessUnitId');
  });

  it('lets scoped staff through a claim-only route (the regression)', () => {
    // Before the fix this threw BusinessUnitScopeError -> 404, making promotion
    // create/update/activate/deactivate unreachable for every MANAGER.
    expect(guard.canActivate(contextFor('claimOnly', buildUser()))).toBe(true);
  });

  it('still blocks a bound role with an empty claim on a claim-only route', () => {
    expect(() =>
      guard.canActivate(contextFor('claimOnly', buildUser({ businessUnitIds: [] }))),
    ).toThrow();
  });

  it('lets an ADMIN through a claim-only route', () => {
    expect(guard.canActivate(contextFor('claimOnly', buildUser({ role: UserRole.ADMIN })))).toBe(
      true,
    );
  });

  it('still matches the param against the claim on a param-scoped route', () => {
    expect(guard.canActivate(contextFor('byUnit', buildUser(), { businessUnitId: 'bu-1' }))).toBe(
      true,
    );
    expect(() =>
      guard.canActivate(contextFor('byUnit', buildUser(), { businessUnitId: 'bu-2' })),
    ).toThrow();
  });

  it('stays fail-closed when a unit param is present but the decorator was forgotten', () => {
    expect(() =>
      guard.canActivate(contextFor('unscoped', buildUser(), { businessUnitId: 'bu-1' })),
    ).toThrow();
  });
});
