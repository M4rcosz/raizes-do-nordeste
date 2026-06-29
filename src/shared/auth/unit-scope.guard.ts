import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { BUSINESS_UNIT_PARAM, ScopedToBusinessUnit } from './scoped-to-business-unit.decorator';
import { BusinessUnitScopeError } from '@shared/errors/application/business-unit-scope.error';

// Roles with no unit binding. They reach every unit; access is decided by
// @Roles alone, never by unit scope. ADMIN is global staff, CUSTOMER belongs to
// no unit. An empty claim on a unit-bound staff role (MANAGER/ATTENDANT/KITCHEN)
// is misconfig, not global, so those still get scoped.
const UNIT_UNBOUND_ROLES: ReadonlySet<UserRole> = new Set([UserRole.ADMIN, UserRole.CUSTOMER]);

/**
 * Enforces unit isolation on management routes. Runs after the global AuthGuard,
 * so request.user is already the verified JWT payload.
 *
 * Rules:
 *   unbound role           -> passes (ADMIN/CUSTOMER ride every unit; gated by @Roles).
 *   bound role, claim empty -> blocked (no unit scope, no management reach).
 *   bound role, param set   -> passes only when claim.businessUnitIds includes the param.
 *   bound role, no param   -> passes ONLY when the route truly carries no unit
 *                            param; if a businessUnitId param is present the
 *                            decorator was forgotten, so fail closed and block.
 *
 * Every block surfaces as not-found (BusinessUnitScopeError) so a foreign unit
 * never leaks its existence to a scoped actor.
 */
@Injectable()
export class UnitScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const paramName = this.reflector.getAllAndOverride<string | undefined>(ScopedToBusinessUnit, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    // AuthGuard runs first and attaches the principal. Its absence means this
    // guard is wired on a route without auth, which is a configuration error.
    if (!user) {
      throw new BusinessUnitScopeError();
    }

    if (UNIT_UNBOUND_ROLES.has(user.role)) {
      return true;
    }

    if (user.businessUnitIds.length === 0) {
      throw new BusinessUnitScopeError();
    }

    // No param named by the decorator. Either an intentional claim-only route or
    // a route that forgot the decorator. Fail closed: if a unit param is actually
    // present in the path, treat the missing decorator as a config slip and block.
    if (paramName === undefined) {
      if (request.params[BUSINESS_UNIT_PARAM] !== undefined) {
        throw new BusinessUnitScopeError();
      }
      return true;
    }

    const param = request.params[paramName];
    if (typeof param !== 'string' || !user.businessUnitIds.includes(param)) {
      throw new BusinessUnitScopeError();
    }

    return true;
  }
}
