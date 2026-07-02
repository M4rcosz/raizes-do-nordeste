# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [Unreleased]

### ⚠ BREAKING CHANGES

* **promotions:** `POST /api/promotions` now requires `businessUnitId` in the
  request body. It was previously derived from the JWT claim; callers must now
  send it explicitly. The use case still validates the value against the actor's
  `businessUnitIds` claim.
* **auth:** the JWT claim `businessUnitId: string | null` is replaced by
  `businessUnitIds: string[]`. Access tokens issued before this change are
  normalized by a temporary compatibility shim in `AuthGuard` until they expire.
* **inventory:** `GET /api/inventory/:businessUnitId` is now cursor-paginated. It
  previously returned a raw array; it now returns the standard envelope
  `{ data: [...], meta: { nextCursor, hasMore } }` and accepts `?cursor=` and
  `?limit=` query params.

### Features

* **identity:** migrate the User-BusinessUnit relationship from 1:1
  (`User.businessUnitId`) to N:N via the `user_business_units` join table. The
  legacy column is kept for now (expand phase) and dropped in a later migration.
* **identity:** add `GET /api/users` (ADMIN/MANAGER, cursor-paginated; filters
  `businessUnitId`/`username`/`email`; MANAGER scoped to its own units).
* **identity:** add `PUT /api/users/:id/business-units` (ADMIN only; full replace
  of a staff user's unit scope).
* **identity:** scope deactivate/reactivate by unit intersection for MANAGER, and
  validate unit binding against the actor's claim on user creation.
* **business-units:** add idempotent `PATCH /api/business-units/:id/activate` and
  `/deactivate` (ADMIN), toggling `isActive`.
* **business-units:** add idempotent `PATCH /api/products/:productId/activate` and
  `/deactivate` (ADMIN), toggling `isActive`.
* **business-units:** add `PATCH /api/business-units/:businessUnitId/menu/:menuItemId/activate`
  (ADMIN/MANAGER, unit-scoped), mirroring the existing deactivate.
* **loyalty:** add LGPD consent management for customers - `POST /api/loyalty/me/consent`
  (idempotent upsert that creates the account if absent) and
  `DELETE /api/loyalty/me/consent`, recording `consentDate`/`consentRevokedAt`.
* **audit:** record toggle and loyalty-consent events (`BUSINESS_UNIT_*`,
  `PRODUCT_*`, `MENU_ITEM_*`, `LOYALTY_CONSENT_GIVEN`/`LOYALTY_CONSENT_REVOKED`).
* **orders:** add `POST /api/orders/:id/cancel` - cancels an order and runs the
  compensation saga (restock + loyalty reversal + refund). Staff may cancel within
  their unit scope; a customer may cancel only while the order is `PENDING`.
  Returns `200` with the cancelled order.
* **orders:** `POST /api/orders` accepts an optional `Idempotency-Key` header
  (per-user, 24h TTL). A replay with the same body returns the original order; a
  replay with a divergent body returns `409`.
* **payments:** add the `REFUNDED` `PaymentStatus`, set by the cancellation refund
  flow.
* **loyalty:** expire points after a rolling 12-month window (daily sweep).
* **platform:** add background sweepers - idempotency-key expiry (hourly), loyalty
  point expiry (daily), and refund reconciliation of an `APPROVED` payment left on
  a `CANCELLED` order (every 10 min).

### Changes

* **identity:** restrict `PATCH /api/users/me` to the `CUSTOMER` role.

## [1.3.0](https://github.com/M4rcosz/raizes-do-nordeste/compare/v1.0.0...v1.3.0) (2026-06-28)


### Features

* **audit:** add audit logs endpoint with cursor pagination and filters ([84088fb](https://github.com/M4rcosz/raizes-do-nordeste/commit/84088fbabcbcc914422b3db66b2088f029ed15f4))
* **auth:** add unit-scope guard and businessUnitId JWT claim ([e01ed7b](https://github.com/M4rcosz/raizes-do-nordeste/commit/e01ed7b906198372bc147da466473f8c02dbd1a8))
* **business-units:** add BusinessUnit entity with CRUD and public endpoints ([ab0b168](https://github.com/M4rcosz/raizes-do-nordeste/commit/ab0b1686946e1473c042f1878dce8058751cd603))
* **business-units:** add per-unit menu management ([9bfe4c8](https://github.com/M4rcosz/raizes-do-nordeste/commit/9bfe4c8c34ba92a7c0553ef91516fe1cb0ddfaf0))
* **identity:** add refresh token rotation and logout ([98d5fba](https://github.com/M4rcosz/raizes-do-nordeste/commit/98d5fba209995371552418355678a5f689160e61))
* **identity:** add self-service password change endpoint ([0111fb3](https://github.com/M4rcosz/raizes-do-nordeste/commit/0111fb3d736629f12f888210b3e20117b670d190))
* **identity:** add user creation and deactivation ([b84dfb2](https://github.com/M4rcosz/raizes-do-nordeste/commit/b84dfb29db03faa830185fe33190932f1de19e5e))
* **identity:** add user reactivation and self-profile update endpoints ([e881333](https://github.com/M4rcosz/raizes-do-nordeste/commit/e88133357b8b8f2e4e57a31f2c8c6e44b14a249f))


### Refactoring

* **auth:** treat CUSTOMER as unit-unbound in UnitScopeGuard ([1558a76](https://github.com/M4rcosz/raizes-do-nordeste/commit/1558a76008e080bcc0983108c0bf5fa9eb5d15bb))


### Documentation

* use dynamic package version badge in README ([c8daa74](https://github.com/M4rcosz/raizes-do-nordeste/commit/c8daa74aee6d3880b893016dc863bdc55b3ea308))

## [1.2.0](https://github.com/M4rcosz/raizes-do-nordeste/compare/v1.0.0...v1.2.0) (2026-06-22)


### Features

* **business-units:** add BusinessUnit entity with CRUD and public endpoints ([086f555](https://github.com/M4rcosz/raizes-do-nordeste/commit/086f555a61c8e1bd91be2fecf9eea10ba2f3c36c))
* **identity:** add user creation and deactivation ([b84dfb2](https://github.com/M4rcosz/raizes-do-nordeste/commit/b84dfb29db03faa830185fe33190932f1de19e5e))

## [1.1.0](https://github.com/M4rcosz/raizes-do-nordeste/compare/v1.0.0...v1.1.0) (2026-06-21)


### Features

* **identity:** add user creation and deactivation ([b84dfb2](https://github.com/M4rcosz/raizes-do-nordeste/commit/b84dfb29db03faa830185fe33190932f1de19e5e))
