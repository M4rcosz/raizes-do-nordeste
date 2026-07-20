import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UnitScopeGuard } from './unit-scope.guard';
import { ScopedToBusinessUnit } from './scoped-to-business-unit.decorator';
import { BusinessUnitScopeError } from '@shared/errors/application/business-unit-scope.error';
import { JwtPayload } from './jwt-payload.type';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';

describe('UnitScopeGuard', () => {
  let guard: UnitScopeGuard;
  let getAllAndOverride: jest.MockedFunction<Reflector['getAllAndOverride']>;

  const buildContext = (
    user: JwtPayload | undefined,
    params: Record<string, string> = {},
  ): ExecutionContext => {
    const request = { user, params };
    return {
      getHandler: (): null => null,
      getClass: (): null => null,
      switchToHttp: (): { getRequest: () => typeof request } => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  };

  // Returns the configured param name only for the ScopedToBusinessUnit key.
  // NOTE: the no-argument decorator form stores {}, not undefined - pass CLAIM_ONLY,
  // never a bare undefined, or this suite drifts back out of sync with the real
  // Reflector. See unit-scope.guard.real-reflector.spec.ts.
  const mockParamName = (paramName: string | object | undefined): void => {
    getAllAndOverride.mockImplementation((key: unknown) =>
      key === ScopedToBusinessUnit ? paramName : undefined,
    );
  };

  // What @ScopedToBusinessUnit() (no argument) actually writes.
  const CLAIM_ONLY = {};

  const buildUser = (overrides?: { role?: UserRole; businessUnitIds?: string[] }): JwtPayload => ({
    sub: 'user-1',
    username: 'panic',
    role: overrides?.role ?? UserRole.MANAGER,
    businessUnitIds: overrides?.businessUnitIds ?? ['bu-1'],
    iat: 0,
    exp: 0,
  });

  beforeAll(async () => {
    getAllAndOverride = jest.fn() as jest.MockedFunction<Reflector['getAllAndOverride']>;
    const reflectorMock = { getAllAndOverride } as unknown as Reflector;

    const moduleRef = await Test.createTestingModule({
      providers: [UnitScopeGuard, { provide: Reflector, useValue: reflectorMock }],
    }).compile();

    guard = moduleRef.get(UnitScopeGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ADMIN bypass', () => {
    it('passes any unit, even on a mismatching param', () => {
      mockParamName('businessUnitId');
      const ctx = buildContext(buildUser({ role: UserRole.ADMIN }), { businessUnitId: 'bu-other' });

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('passes an ADMIN with an empty (global) scope', () => {
      mockParamName('businessUnitId');
      const ctx = buildContext(buildUser({ role: UserRole.ADMIN, businessUnitIds: [] }), {
        businessUnitId: 'bu-other',
      });

      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('CUSTOMER is unit-unbound (passes like ADMIN)', () => {
    it('passes a CUSTOMER with an empty scope on a param route (not blocked as misconfig)', () => {
      mockParamName('businessUnitId');
      const ctx = buildContext(buildUser({ role: UserRole.CUSTOMER, businessUnitIds: [] }), {
        businessUnitId: 'bu-1',
      });

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('passes a CUSTOMER even on a mismatching param (access gated by @Roles, not unit)', () => {
      mockParamName('businessUnitId');
      const ctx = buildContext(buildUser({ role: UserRole.CUSTOMER, businessUnitIds: [] }), {
        businessUnitId: 'bu-other',
      });

      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('scoped non-admin (param route)', () => {
    it('passes when the route param is in the claim', () => {
      mockParamName('businessUnitId');
      const ctx = buildContext(buildUser({ businessUnitIds: ['bu-1'] }), {
        businessUnitId: 'bu-1',
      });

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('blocks (not-found) when the route param is a foreign unit', () => {
      mockParamName('businessUnitId');
      const ctx = buildContext(buildUser({ businessUnitIds: ['bu-1'] }), {
        businessUnitId: 'bu-2',
      });

      expect(() => guard.canActivate(ctx)).toThrow(BusinessUnitScopeError);
    });

    it('blocks (not-found) a non-admin with an empty scope', () => {
      mockParamName('businessUnitId');
      const ctx = buildContext(buildUser({ businessUnitIds: [] }), { businessUnitId: 'bu-1' });

      expect(() => guard.canActivate(ctx)).toThrow(BusinessUnitScopeError);
    });
  });

  describe('multi-unit non-admin (regression for N:N scope)', () => {
    it('passes each unit in a multi-unit claim', () => {
      mockParamName('businessUnitId');
      const both = buildUser({ businessUnitIds: ['bu-1', 'bu-2'] });

      expect(guard.canActivate(buildContext(both, { businessUnitId: 'bu-1' }))).toBe(true);
      expect(guard.canActivate(buildContext(both, { businessUnitId: 'bu-2' }))).toBe(true);
    });

    it('blocks a unit outside a multi-unit claim', () => {
      mockParamName('businessUnitId');
      const ctx = buildContext(buildUser({ businessUnitIds: ['bu-1', 'bu-2'] }), {
        businessUnitId: 'bu-3',
      });

      expect(() => guard.canActivate(ctx)).toThrow(BusinessUnitScopeError);
    });
  });

  describe('claim-only route (no param)', () => {
    it('passes a scoped non-admin', () => {
      mockParamName(CLAIM_ONLY);
      const ctx = buildContext(buildUser({ businessUnitIds: ['bu-1'] }));

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('blocks a non-admin with an empty scope', () => {
      mockParamName(CLAIM_ONLY);
      const ctx = buildContext(buildUser({ businessUnitIds: [] }));

      expect(() => guard.canActivate(ctx)).toThrow(BusinessUnitScopeError);
    });
  });

  describe('fail-closed (decorator forgotten)', () => {
    it('blocks when the decorator is absent but the route carries a unit param', () => {
      // No @ScopedToBusinessUnit metadata, yet a businessUnitId param is present:
      // a config slip. Deny even when the param happens to match the claim.
      mockParamName(CLAIM_ONLY);
      const ctx = buildContext(buildUser({ businessUnitIds: ['bu-1'] }), {
        businessUnitId: 'bu-1',
      });

      expect(() => guard.canActivate(ctx)).toThrow(BusinessUnitScopeError);
    });
  });

  describe('misconfiguration', () => {
    it('blocks when no principal is attached (guard wired without auth)', () => {
      mockParamName('businessUnitId');
      const ctx = buildContext(undefined, { businessUnitId: 'bu-1' });

      expect(() => guard.canActivate(ctx)).toThrow(BusinessUnitScopeError);
    });
  });
});
