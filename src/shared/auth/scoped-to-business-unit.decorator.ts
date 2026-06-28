import { Reflector } from '@nestjs/core';

/** Conventional route param holding the unit id. Used by the guard's fail-closed check. */
export const BUSINESS_UNIT_PARAM = 'businessUnitId';

/**
 * Marks a management route as scoped to a single business unit and names the
 * route param that carries the unit id (every scoped route uses 'businessUnitId'
 * today). Read by UnitScopeGuard to match the param against the actor's claim.
 *
 * Call with no argument for routes that carry no unit param (e.g. create, where
 * the unit comes from the claim); the guard then only asserts the actor is
 * scoped or admin. The guard is fail-closed: a route that DOES expose a unit
 * param but forgot this decorator is denied, not waved through.
 */
export const ScopedToBusinessUnit = Reflector.createDecorator<string | undefined>();
