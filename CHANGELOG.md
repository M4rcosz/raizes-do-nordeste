# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [2.2.1](https://github.com/M4rcosz/raizes-do-nordeste/compare/v2.2.0...v2.2.1) (2026-07-05)


### Bug Fixes

* **deploy:** trust Supabase root CA for prod TLS verification ([b2b6e2f](https://github.com/M4rcosz/raizes-do-nordeste/commit/b2b6e2f44cdef87c8ad50121f63505c7e348ef3e))

## [2.2.0](https://github.com/M4rcosz/raizes-do-nordeste/compare/v2.0.0...v2.2.0) (2026-07-05)


### Features

* **business-units:** expose category CRUD via REST API ([03726fc](https://github.com/M4rcosz/raizes-do-nordeste/commit/03726fcfbd23d34254c0addbd15039b1b4e6a2b6))
* **deploy:** bootstrap initial admin on container start ([775f57f](https://github.com/M4rcosz/raizes-do-nordeste/commit/775f57f3f92e5d76eea771c8aa136af744da71f7))

## [2.1.0](https://github.com/M4rcosz/raizes-do-nordeste/compare/v2.0.0...v2.1.0) (2026-07-05)


### Features

* **business-units:** expose category CRUD via REST API ([03726fc](https://github.com/M4rcosz/raizes-do-nordeste/commit/03726fcfbd23d34254c0addbd15039b1b4e6a2b6))

## [2.0.0](https://github.com/M4rcosz/raizes-do-nordeste/compare/v1.3.0...v2.0.0) (2026-07-04)


### ⚠ BREAKING CHANGES

* **identity:** CORS_ORIGINS is now required in production; boot fails closed when it is unset.
* **identity:** JWT claim businessUnitId (string|null) is now businessUnitIds (string[]); AuthGuard provides shim for legacy tokens; clients must update to array-based scoping
* **identity:** POST /api/promotions now requires businessUnitId in request body (previously derived from claim), validated against actor's units

### Features

* add idempotent activation toggles and LGPD consent lifecycle ([1fc3a9a](https://github.com/M4rcosz/raizes-do-nordeste/commit/1fc3a9afcaabc463fcd1cc47c922e7fe89e7bc53))
* **business-units:** add ADMIN-only partial product update endpoint ([b136531](https://github.com/M4rcosz/raizes-do-nordeste/commit/b1365315d907e9f57f34d020f1c4de4116d5bbb5))
* **deploy:** production-ready container and CORS allowlist ([a0947b5](https://github.com/M4rcosz/raizes-do-nordeste/commit/a0947b5264c0c4333c81a8a88da1a120bbb01168))
* **identity,orders:** self-service /me read endpoints ([acc9c48](https://github.com/M4rcosz/raizes-do-nordeste/commit/acc9c48f22e0d39aee0c5d2bb76f6af7f2fb8e85))
* **identity:** opt-in httpOnly cookie transport for refresh token ([458af10](https://github.com/M4rcosz/raizes-do-nordeste/commit/458af103e5eaf3a164d7528dd67c5f71c3197f51))
* **identity:** support multi-unit user assignment via JWT array claim ([98922f0](https://github.com/M4rcosz/raizes-do-nordeste/commit/98922f015f5fb5d0a002fab27ddc672e4409ff22))
* **observability:** add liveness health probe ([7aa3b8c](https://github.com/M4rcosz/raizes-do-nordeste/commit/7aa3b8c65660b7bc4fb52ca3fcb0045f5cc91b5c))
* platform-hardening batch (idempotency, cancel/refund, loyalty expiry) ([76cd576](https://github.com/M4rcosz/raizes-do-nordeste/commit/76cd5768649d6721ce424af653cbb4b6f59b0edb))
* **swagger:** expose the API docs in production ([8ff09ca](https://github.com/M4rcosz/raizes-do-nordeste/commit/8ff09ca7e12163db416feb294c5c0ecd8e698041))


### Bug Fixes

* **prisma:** verify runtime TLS against the database CA cert ([21e793e](https://github.com/M4rcosz/raizes-do-nordeste/commit/21e793ebefc33d49192e057eec0bdecb46498f15))


### Documentation

* document cancel/refund, idempotency-key, inventory pagination and loyalty expiry ([3a60efa](https://github.com/M4rcosz/raizes-do-nordeste/commit/3a60efa6f60334fe7853869d2eaa73b223793335))

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
