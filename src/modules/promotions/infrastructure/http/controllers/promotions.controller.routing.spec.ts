import { describe, expect, it } from '@jest/globals';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@shared/auth/public.decorator';
import { Roles } from '@shared/auth/roles.decorator';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { UnitScopeGuard } from '@shared/auth/unit-scope.guard';
import { PromotionsController } from './promotions.controller';

/**
 * Guards the auth wiring of this controller, which unit tests on the handlers cannot
 * see: they call methods directly and never go through Nest's guard pipeline.
 *
 * The trap being tested: UnitScopeGuard throws when request.user is absent, and a
 * @Public route never gets a user. So a class-level @UseGuards(UnitScopeGuard) turns
 * the customer route into a blanket 404. It must stay per-method.
 */
describe('PromotionsController routing/auth metadata', () => {
  const reflector = new Reflector();

  const guardsOn = (target: object): unknown[] =>
    (Reflect.getMetadata('__guards__', target) as unknown[] | undefined) ?? [];

  it('does not put UnitScopeGuard on the class', () => {
    expect(guardsOn(PromotionsController)).not.toContain(UnitScopeGuard);
  });

  it('marks the customer listing public', () => {
    const isPublic = Reflect.getMetadata(
      IS_PUBLIC_KEY,
      PromotionsController.prototype.findActiveByBusinessUnit,
    ) as boolean | undefined;

    expect(isPublic).toBe(true);
  });

  it('keeps UnitScopeGuard off the public route', () => {
    expect(guardsOn(PromotionsController.prototype.findActiveByBusinessUnit)).not.toContain(
      UnitScopeGuard,
    );
  });

  it.each([
    'create',
    'findByBusinessUnit',
    'findById',
    'update',
    'activate',
    'deactivate',
  ] as const)('keeps UnitScopeGuard on the management route %s', (handler) => {
    expect(guardsOn(PromotionsController.prototype[handler])).toContain(UnitScopeGuard);
  });

  it.each([
    'create',
    'findByBusinessUnit',
    'findById',
    'update',
    'activate',
    'deactivate',
  ] as const)('never marks the management route %s public', (handler) => {
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, PromotionsController.prototype[handler]) as
      | boolean
      | undefined;

    expect(isPublic).toBeUndefined();
  });

  it.each([
    'create',
    'findByBusinessUnit',
    'findById',
    'update',
    'activate',
    'deactivate',
  ] as const)('keeps the ADMIN/MANAGER role gate on the management route %s', (handler) => {
    // The guard assertions above would still pass if @Roles were dropped, which would
    // silently open these routes to any authenticated CUSTOMER.
    const roles = reflector.get(Roles, PromotionsController.prototype[handler]);

    expect(roles).toEqual([UserRole.ADMIN, UserRole.MANAGER]);
  });

  it('leaves the public route without a role gate', () => {
    const roles = reflector.get(Roles, PromotionsController.prototype.findActiveByBusinessUnit);

    expect(roles).toBeUndefined();
  });

  it('declares the public path before the :promotionId catch-all so it is matched first', () => {
    const pathOf = (handler: keyof typeof PromotionsController.prototype): string =>
      Reflect.getMetadata(PATH_METADATA, PromotionsController.prototype[handler]) as string;

    const handlers = Object.getOwnPropertyNames(PromotionsController.prototype);
    expect(handlers.indexOf('findActiveByBusinessUnit')).toBeLessThan(handlers.indexOf('findById'));
    expect(pathOf('findActiveByBusinessUnit')).toBe('public/by-business-unit/:businessUnitId');
    expect(pathOf('findById')).toBe(':promotionId');
  });
});
