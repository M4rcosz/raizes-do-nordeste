import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { BUSINESS_UNIT_PARAM, ScopedToBusinessUnit } from './scoped-to-business-unit.decorator';
import { BusinessUnitScopeError } from '@shared/errors/application/business-unit-scope.error';

/**
 * Enforces unit isolation on management routes. Runs after the global AuthGuard,
 * so request.user is already the verified JWT payload.
 *
 * Rules:
 *   ADMIN                 -> passes (rides every unit, including global/null).
 *   non-admin, claim null -> blocked (no unit scope, no management reach).
 *   non-admin, param set  -> passes only when param == claim.businessUnitId.
 *   non-admin, no param   -> passes ONLY when the route truly carries no unit
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

    if (user.role === UserRole.ADMIN) {
      return true;
    }

    if (user.businessUnitId === null) {
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

    if (request.params[paramName] !== user.businessUnitId) {
      throw new BusinessUnitScopeError();
    }

    return true;
  }
}
