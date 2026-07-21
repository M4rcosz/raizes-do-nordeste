# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [3.3.0](https://github.com/M4rcosz/raizes-do-nordeste/compare/v3.2.0...v3.3.0) (2026-07-21)


### Features

* **ai:** add usage reporting and persisted chat conversations ([e40979f](https://github.com/M4rcosz/raizes-do-nordeste/commit/e40979fee68042ebfa3b5b2e1767d754646a4203))

## [3.2.0](https://github.com/M4rcosz/raizes-do-nordeste/compare/v3.1.0...v3.2.0) (2026-07-20)


### Features

* **ai:** add soft revocation and reinstatement of AI memberships ([64ffd51](https://github.com/M4rcosz/raizes-do-nordeste/commit/64ffd510ed3a9f38ebb4c3b542c605539a608652))
* **promotions:** add a public listing of currently valid promotions ([9a96f20](https://github.com/M4rcosz/raizes-do-nordeste/commit/9a96f20b770a3f71c0f1d4e4c336dc5bd2c235a1))


### Bug Fixes

* **auth:** restore the dead claim-only branch in UnitScopeGuard ([6abd98d](https://github.com/M4rcosz/raizes-do-nordeste/commit/6abd98d93101e91dc39ade56cf44fc42936abbed))

## [3.1.0](https://github.com/M4rcosz/raizes-do-nordeste/compare/v3.0.0...v3.1.0) (2026-07-19)


### Features

* **identity:** add a role filter to the user listing ([9c1508d](https://github.com/M4rcosz/raizes-do-nordeste/commit/9c1508db70d8224e057fd5b90bdbbfcc93424848))
* **identity:** add exact-match customer lookup for counter orders ([d55dbf4](https://github.com/M4rcosz/raizes-do-nordeste/commit/d55dbf44357844c74b4528dfb75d4c336b23594b))


### Bug Fixes

* **orders:** validate the body-supplied customerId on order creation ([268e4c0](https://github.com/M4rcosz/raizes-do-nordeste/commit/268e4c05bc917059002cc51d159d6dec29286535))

## [3.0.0](https://github.com/M4rcosz/raizes-do-nordeste/compare/v2.5.0...v3.0.0) (2026-07-18)


### ⚠ BREAKING CHANGES

* **orders:** TOTEM orders now require customerName in the request body.
Clients omitting it receive 422 GuestNameRequiredError.

### Features

* **ai:** expand tool surface with 7 new context-scoped tools ([5dafd7f](https://github.com/M4rcosz/raizes-do-nordeste/commit/5dafd7fa64c07841bb393508db6e7c828b77540d))
* **orders:** add channel-gated guest customer name for walk-in ordering ([3373f4c](https://github.com/M4rcosz/raizes-do-nordeste/commit/3373f4caf17fc109e10b21ba231c4a2f0c41057f))

## [2.5.0](https://github.com/M4rcosz/raizes-do-nordeste/compare/v2.4.2...v2.5.0) (2026-07-17)


### Features

* **ai:** add admin-managed per-user AI token membership ([4c89ae6](https://github.com/M4rcosz/raizes-do-nordeste/commit/4c89ae62e819159954915ed658d0af9ef23e44f9))
* **ai:** add Gemini-backed chat co-worker with actor-scoped tool use ([1caf2fd](https://github.com/M4rcosz/raizes-do-nordeste/commit/1caf2fd8156ccfd0e0dd99a3a56f0795078b95f4))
* **identity:** harden password and email input validation ([36c7ddc](https://github.com/M4rcosz/raizes-do-nordeste/commit/36c7ddc5b73b046626fb96dcf69f6cf160d16cc8))
* **orders:** add filters and sorting to staff order listing ([79f36e8](https://github.com/M4rcosz/raizes-do-nordeste/commit/79f36e8b06fb8d6388ddb2aed52d6f9746f84cf6))


### Bug Fixes

* **identity:** enforce case-insensitive email uniqueness at the DB ([6dc6fb3](https://github.com/M4rcosz/raizes-do-nordeste/commit/6dc6fb3b3c6829ee4feb37dd43b6189710fba5a4))


### Build System

* **test:** replace ts-jest with @swc/jest transform ([4a0122f](https://github.com/M4rcosz/raizes-do-nordeste/commit/4a0122ffba8f0bb6140193efc5213562dd8c5bfe))

## [2.4.2](https://github.com/M4rcosz/raizes-do-nordeste/compare/v2.4.1...v2.4.2) (2026-07-10)


### Bug Fixes

* **identity:** guard revokeChainFrom against a cyclic rotation chain ([760427f](https://github.com/M4rcosz/raizes-do-nordeste/commit/760427f33f322fe2e02dd2a7eb049b24a12d8dfb))

## [2.4.1](https://github.com/M4rcosz/raizes-do-nordeste/compare/v2.4.0...v2.4.1) (2026-07-10)


### Refactoring

* **config:** validate duration env vars at boot ([1580035](https://github.com/M4rcosz/raizes-do-nordeste/commit/158003507f938e23061dbaba132fc9bbc503066d))
* **scheduling:** extract IntervalSweeper base for sweepers ([8875c49](https://github.com/M4rcosz/raizes-do-nordeste/commit/8875c49bca48113adaaaf5f4b150893051f84ba4))
* **scripts:** split bootstrap-admin into testable core ([bfddd0d](https://github.com/M4rcosz/raizes-do-nordeste/commit/bfddd0d1cf242ee212c97c968cabc8208c9aed2b))

## [2.4.0](https://github.com/M4rcosz/raizes-do-nordeste/compare/v2.3.0...v2.4.0) (2026-07-09)


### Features

* **identity:** harden username rules and make it case-insensitive ([76b497e](https://github.com/M4rcosz/raizes-do-nordeste/commit/76b497e361d359795809b7abdc8cf0b76a825e18))
* **inventory:** add stock-item init endpoint and harden write path ([138cbe5](https://github.com/M4rcosz/raizes-do-nordeste/commit/138cbe54c379fe58c53e1e0334096e052feef77b))


### Documentation

* pin version badge to development and flag upcoming rename ([b0f4c6e](https://github.com/M4rcosz/raizes-do-nordeste/commit/b0f4c6ef83c47b53d8e6340a7859e1d4d840f605))

## [2.3.0](https://github.com/M4rcosz/raizes-do-nordeste/compare/v2.2.1...v2.3.0) (2026-07-06)


### Features

* **business-units:** add endpoint to update business unit fields ([3033664](https://github.com/M4rcosz/raizes-do-nordeste/commit/30336643a3950c05ccd3b72d3da7dbb54b7d5fd7))


### Documentation

* **deploy:** document Render + Supabase production deployment ([5d73bc2](https://github.com/M4rcosz/raizes-do-nordeste/commit/5d73bc21a0857f1430d96cd99af14c4d5f608e3c))

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
