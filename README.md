# Raízes do Nordeste - Backend API

[![CI](https://github.com/M4rcosz/raizes-do-nordeste/actions/workflows/ci.yml/badge.svg)](https://github.com/M4rcosz/raizes-do-nordeste/actions/workflows/ci.yml)
[![version](https://img.shields.io/github/package-json/v/M4rcosz/raizes-do-nordeste?color=blue)](https://github.com/M4rcosz/raizes-do-nordeste/releases)

Repository: <https://github.com/M4rcosz/raizes-do-nordeste>

REST API for a multi-unit restaurant ordering system. The platform powers menu
browsing, order management, payment processing, inventory control and a
customer loyalty program - across multiple business units (franchises).

> **Status:** the project is being built incrementally. The shipped surface
> is the product catalog (public browsing + role-gated creation), per-unit
> menu management (add/update/deactivate menu items with a required custom
> price, public cursor-paginated listing plus an internal management view),
> identity
> (JWT login + argon2 hashing + global role guard, public customer
> self-registration, role-gated user creation and deactivation, refresh-token
> rotation with reuse detection and logout), a cross-cutting audit
> log wired into the login flow, **orders** (channel-aware creation, reads,
> status state machine), **payments** (gateway charge + HMAC-signed webhook
> confirmation that advances the order, plus a stale-payment sweeper),
> **inventory** (stock deducted atomically on order creation, manual
> adjustments, low-stock alerts), **loyalty** (auto-enrolment on the first
> order, consent-gated points credited on approved payments) and
> **promotions** (percentage / fixed-amount discounts, CRUD plus one promotion
> applied per order, priced before loyalty). All seven bounded contexts now
> have application code shipped (see [Roadmap](#roadmap)).

---

## Table of Contents

- [Stack](#stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Code Quality](#code-quality)
- [Roadmap](#roadmap)
- [License](#license)

---

## Stack

| Technology | Version | Role                          |
| ---------- | ------- | ----------------------------- |
| Node.js    | 24      | Runtime                       |
| NestJS     | 11      | HTTP framework / DI container |
| TypeScript | 5.7     | Language                      |
| Prisma     | 7       | ORM and migration tool        |
| PostgreSQL | 17      | Relational database           |
| Jest       | 30      | Unit and e2e testing          |
| Docker     | 29      | Containerization              |
| big.js     | 7       | Arbitrary-precision decimals  |

---

## Architecture

The codebase follows **Clean Architecture organized by bounded context** - each
business context owns its own four-layer stack, and dependencies point strictly
inwards (infrastructure -> application -> domain).

```
   ┌────────────────────────────────────────────────────────┐
   │                       API Layer                        │  HTTP edge
   │  (NestJS controllers, guards, pipes, exception filters)│
   └───────────────────────────┬────────────────────────────┘
                               │ depends on
   ┌───────────────────────────▼────────────────────────────┐
   │                    Application Layer                   │  Orchestration
   │            (Use Cases - one per business action)       │
   └───────────────────────────┬────────────────────────────┘
                               │ depends on
   ┌───────────────────────────▼────────────────────────────┐
   │                       Domain Layer                     │  Pure rules
   │  (Entities, value objects, repository interfaces)      │
   └───────────────────────────▲────────────────────────────┘
                               │ implemented by
   ┌───────────────────────────┴────────────────────────────┐
   │                  Infrastructure Layer                  │  Adapters
   │   (Prisma client, repositories, external integrations) │
   └────────────────────────────────────────────────────────┘
```

> **Heads-up - structural change mid-project (May 2026):** the codebase was
> refactored from a flat layout (`src/domain`, `src/infrastructure`,
> `src/modules/<feature>`) into a per-bounded-context layout
> (`src/modules/<context>/{domain,application,infrastructure}`). The flat
> shape worked while only one feature module existed, but the planned domain
> spans seven bounded contexts (`identity`, `business-units`, `inventory`,
> `orders`, `payments`, `promotions`, `loyalty`) and a global `domain/` would
> have ended up mixing entities from unrelated contexts. Moving the layered
> stack inside each context makes ownership explicit, keeps cross-context
> coupling visible (it has to cross a module boundary), and is the canonical
> DDD layout.

### Architectural Decisions

**1. Clean Architecture with NestJS pragmatism**
The `domain/` layer of each context contains pure TypeScript - no NestJS, no
Prisma, no framework imports. This keeps business rules portable and trivial
to unit test. Use cases, however, use `@Injectable()` so the DI container can
wire them up - this is a deliberate, accepted compromise for ergonomics.

**2. Repository Pattern**
Each context's `domain/repositories/` declares interfaces. The matching
`infrastructure/persistence/` provides Prisma-backed implementations. Use
cases depend on the interface through a `Symbol` injection token (e.g.
`PRODUCT_REPOSITORY`), which keeps the ORM swappable without touching domain
or application code.

**3. Use Cases as the application boundary**
Each business action is a single-purpose class with one `execute()` method.
This produces small, focused, easy-to-test units and prevents controllers
from accumulating logic.

**4. Domain Entities, never raw ORM models**
Repositories convert Prisma rows into rich domain entities (`Product`,
`BusinessUnitMenuItem`) before returning them. Controllers convert entities
into response DTOs (`ProductResponseDto`) before sending them over HTTP.
ORM models never leak across layer boundaries.

**5. Decimal-safe monetary values**
Money is modeled as a `Money` value object wrapping
[`big.js`](https://github.com/MikeMcl/big.js) (avoiding IEEE-754 rounding
errors) inside the domain, and stored as `Decimal(10, 2)` in PostgreSQL. Money
is serialized as a **decimal string** at the HTTP edge (e.g. `"12.50"`) so JSON
cannot reintroduce float rounding on the client; the product response now emits
`price` as a string too. `Product` already uses the `Money` VO; the remaining
money-bearing entities (`Order`, `OrderItem`, `Payment`, `LoyaltyAccount`)
still use `big.js` raw and are being migrated slice by slice. Inbound monetary
fields are likewise validated as decimal strings (`@IsDecimal`) and never
coerced via `@Type(() => Number)`.

**6. Errors model intent, not transport**

- Domain and application errors extend shared base classes
  (`DomainError` / `ApplicationError`) that carry a transport-agnostic
  `kind` (`not-found`, `invalid`, `conflict`, `unauthorized`, `forbidden`,
  `unavailable`) - never an HTTP status.
- A global exception filter (`shared/filter/`, registered via `APP_FILTER`)
  is the single place that maps `kind` -> HTTP status, re-wraps NestJS
  `HttpException`s, and emits one consistent JSON envelope. It logs the full
  `Error.cause` chain server-side but never leaks internals to the client.
- `ProductsFetchError` (application layer) wraps the underlying repository
  failure with the standard `Error.cause` option and `kind: unavailable`.
- Repositories translate persistence-specific failures into domain errors at
  the boundary - a Prisma `P2002` unique-constraint violation becomes
  `ProductAlreadyExistsError` (`kind: conflict`) and a `P2003` foreign-key
  violation becomes `CategoryNotFoundError` (`kind: not-found`), each chaining
  the original error as `Error.cause`. Application and domain code therefore
  never sees an ORM-specific error shape.

**7. `shared/` is the cross-context kernel**
Anything reused across two or more contexts (Prisma client lifecycle,
pagination primitives, the `Money` value object (and future `Email`/`Id` VOs), global guards
and interceptors) lives in `src/shared/`. If something is used by only one
context, it stays inside that context.

**8. Cross-context capabilities are exposed via published ports**
A bounded context that needs to be **consumed** by other contexts (e.g.
`audit`) publishes a port - a TypeScript `interface` plus a `Symbol` DI
token - in its `application/ports/` folder, and binds the token to its
implementation in its NestJS module's `providers` / `exports`. Consumers
inject the token and depend on the interface only; they never import
entities or repositories from another context's `domain/`. This is the
mechanism behind `AUDIT_LOGGER`: `SignInUseCase` (in `identity`) injects
the port without knowing that the concrete `AuditService` lives in
`modules/audit/`. The same shape will be reused when future order /
payment use cases need to log audit entries.

**9. Path aliases for cross-boundary imports**
Imports that cross a context boundary use TypeScript path aliases:

- `@shared/*` -> `src/shared/*`
- `@modules/*` -> `src/modules/*`

Imports **inside** the same bounded context stay relative
(`../domain/entities/product.entity`). The alias is a visual signal that
the import crosses a context boundary; a relative path documents that the
dependency stays local. This is a convention, not a lint rule - review for
it in PRs.

> When adding a new alias, **four** configs must stay in sync:
> `tsconfig.json` (`compilerOptions.paths`), `.swcrc` (`jsc.paths`),
> `package.json` (`jest.moduleNameMapper`) and `test/jest-e2e.json`
> (`moduleNameMapper`). If only one is updated, type-check passes but the
> build output (or tests, or runtime) silently breaks. The values look
> different in each file because they are interpreted relative to
> different roots: `tsconfig.json` paths are relative to the tsconfig
> directory (so `./src/shared/*`); `.swcrc` paths are relative to
> `jsc.baseUrl` (so `shared/*` with baseUrl `./src`); jest paths use
> jest's `<rootDir>` token.

**10. Build pipeline - SWC with `tsc` type-check sidecar**
`nest build` uses [SWC](https://swc.rs/) (configured in `nest-cli.json`
under `compilerOptions.builder`) instead of `tsc`. SWC compiles each file
in parallel - roughly 10x faster on this codebase - and resolves path
aliases natively, so `dist/` contains real relative paths and no runtime
alias resolver is needed.

SWC reads its own configuration from a top-level `.swcrc` file. We keep
that file minimal: it declares only `jsc.baseUrl` and `jsc.paths` so SWC
has its own source of truth for alias resolution and does not try to
recombine the tsconfig values. The decorator and `emitDecoratorMetadata`
behavior NestJS needs comes from the defaults that the `@nestjs/cli`
SWC integration injects - replicating them in `.swcrc` would just be
duplication.

SWC does not perform type checking. The `typeCheck: true` flag in
`nest-cli.json` runs `tsc --noEmit` alongside the SWC compile so type
errors still fail the build.

> **Caveat - circular imports + SWC.** Because SWC compiles each file
> in isolation, it can mis-emit `design:type` reflection metadata when two
> files reference each other across a decorator boundary (`@Injectable()`,
> `class-validator`, decorator-driven ORMs). The build succeeds; the bug
> surfaces only at runtime (DI injects `undefined`, validator silently
> skipped, ORM loses the relation).
>
> **Low risk for this project today** - Prisma does not rely on
> `emitDecoratorMetadata` and domain entities are plain classes.
> `class-validator` is now wired (global `ValidationPipe` + `SignInDto`),
> but its DTOs are flat (no bidirectional aggregate references), so the
> mis-emit cannot trigger yet. Watch for it when:
>
> - Adding `class-validator` DTOs with bidirectional aggregate references
> - Adding modules with circular DI (use NestJS `forwardRef()`)
> - Adopting a decorator-based ORM with bidirectional relations
>
> Mitigations, in preferred order: (1) use `import type` for type-only
> imports - they are erased at runtime and break many cycles automatically;
> (2) treat circularity as a design smell and refactor; (3) `forwardRef()`
> for module-level DI cycles; (4) for metadata-driven cases without ORM
> workarounds, define a wrapper type analogous to TypeORM's `Relation<T>`
> so SWC does not inline the type.

---

## Project Structure

```
src/
├── main.ts                       ← Bootstrap: prefix /api, CORS, shutdown hooks
├── app.module.ts                 ← Root module wiring
├── shared/                       ← Cross-context kernel
│   ├── auth/                     ← Global AuthGuard, @Public/@Roles, JWT payload
│   ├── errors/                   ← DomainError/ApplicationError base + ErrorKind
│   ├── filter/                   ← Global exception filter (error -> envelope)
│   ├── infrastructure/
│   │   └── prisma/               ← @Global() PrismaService + lifecycle
│   └── pagination/               ← Cursor-pagination types and DTO envelope
└── modules/                      ← One folder per bounded context
    ├── audit/                    ← Cross-cutting audit logging + ADMIN read endpoint
    │   ├── audit.module.ts
    │   ├── domain/               ← AuditLog entity, AuditAction const, AuditLogRepository (+findMany)
    │   ├── application/          ← AuditService (impl), AuditLogger port, ListAuditLogsUseCase, errors
    │   └── infrastructure/       ← PrismaAuditLogRepository, AuditLogsController, DTOs
    ├── business-units/           ← Business Units, Products, Categories, Menu Items
    │   ├── business-units.module.ts
    │   ├── domain/               ← Pure rules (no framework imports)
    │   │   ├── entities/         ← BusinessUnit, Product, BusinessUnitMenuItem
    │   │   ├── errors/           ← Domain errors (extend shared DomainError)
    │   │   └── repositories/     ← Interfaces + DI tokens
    │   ├── application/          ← Orchestration
    │   │   ├── use-cases/        ← One file per business action
    │   │   └── errors/           ← App-layer errors (extend shared ApplicationError)
    │   └── infrastructure/       ← Adapters
    │       ├── persistence/      ← Prisma repository implementations
    │       └── http/
    │           ├── controllers/  ← NestJS controllers
    │           └── dto/          ← Request + response DTOs
    ├── identity/                 ← Users, JWT auth, login, registration, roles
    │   ├── identity.module.ts
    │   ├── domain/               ← User entity, repo + hasher/signer ports, UserRole, UserCreationPolicy
    │   ├── application/          ← SignIn/RegisterCustomer/CreateUser/DeactivateUser use cases + app-layer errors
    │   └── infrastructure/       ← Argon2 hasher, JWT signer, auth + users controllers/DTOs
    ├── orders/                   ← Channel-aware creation, reads, status state machine
    │   ├── orders.module.ts
    │   ├── domain/               ← Order/OrderItem entities, OrderChannel/Status VOs (channel policies + transitions), OrderRepository, errors
    │   ├── application/          ← Use cases (create/find/list/update-status), OrderForPayment + OrderProductLookup ports, errors
    │   └── infrastructure/       ← PrismaOrderRepository, OrdersController, request/response DTOs
    ├── payments/                 ← Gateway charge + HMAC-signed webhook confirmation
    │   ├── payments.module.ts
    │   ├── domain/               ← Payment entity, PaymentStatus/PaymentMethod VOs, PaymentRepository
    │   ├── application/          ← CreatePayment/ConfirmPayment/FindPaymentByOrder/ExpireStalePayments, PaymentGateway port, errors
    │   └── infrastructure/       ← MockPaymentGateway, PrismaPaymentRepository, PaymentsController, webhook signature guard, DTOs
    ├── inventory/                ← Stock balances + transaction ledger
    │   ├── inventory.module.ts
    │   ├── domain/               ← Inventory entity, InventoryTransactionType VO, InventoryRepository, errors
    │   ├── application/          ← GetInventory/AdjustInventory/DeductStockForOrder, StockDeduction port (consumed by orders), errors
    │   └── infrastructure/       ← PrismaInventoryRepository, InventoryController, DTOs
    ├── loyalty/                  ← Customer points program (LGPD consent-gated)
    │   ├── loyalty.module.ts
    │   ├── domain/               ← LoyaltyAccount/LoyaltyTransaction entities, VOs, repository
    │   ├── application/          ← EnrollCustomer/EarnPoints/GetMyLoyaltyAccount, LoyaltyEnrollment + LoyaltyEarning ports, errors
    │   └── infrastructure/       ← PrismaLoyaltyRepository, LoyaltyController, DTOs
    └── promotions/               ← Discount campaigns applied to orders
        ├── promotions.module.ts
        ├── domain/               ← Promotion entity, DiscountType/PromotionRules VOs, PromotionRepository, errors
        ├── application/          ← Create/Update/FindById/List + ApplyPromotions use cases, PromotionApplication port (consumed by orders), errors
        └── infrastructure/       ← PrismaPromotionRepository, PromotionsController, DTOs
prisma/
├── schema.prisma                 ← Single source of truth for the database
├── seed.ts                       ← Idempotent seed for local dev
└── migrations/                   ← Versioned migration history
docs/
└── TESTS.md                      ← Smoke-test scenarios (positive + negative)
test/
├── app.e2e-spec.ts               ← Product HTTP e2e
├── auth-audit.e2e-spec.ts        ← Login + audit_logs persistence e2e
├── validation-pipe.e2e-spec.ts   ← Global ValidationPipe e2e
├── global-error-filter.e2e-spec.ts ← Error envelope e2e (full pipeline)
├── orders.e2e-spec.ts            ← Orders + inventory + loyalty enrolment e2e
└── payments.e2e-spec.ts          ← Critical flow A (order → pay → webhook → confirm) e2e
```

> All seven bounded contexts now live under `src/modules/`, each following the
> same four-layer internal shape.

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) **29+**
- [Node.js](https://nodejs.org/) **24+**
- WSL Ubuntu 24.04 (if on Windows)

### 1. Clone the repository

```bash
git clone https://github.com/M4rcosz/raizes-do-nordeste.git
cd raizes-do-nordeste
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
POSTGRES_USER=adminuser
POSTGRES_PASSWORD=your_password
POSTGRES_DB=raizes_do_nordeste
DATABASE_URL="postgresql://adminuser:your_password@localhost:5432/raizes_do_nordeste?schema=public"

NODE_ENV=development
PORT=3000

JWT_SECRET_KEY=replace-with-a-strong-random-secret
PAYMENT_WEBHOOK_SECRET=replace-with-a-strong-random-secret
```

> `DATABASE_URL` uses `localhost` for local development. The full-stack
> Docker compose (`docker-compose.prod.yml`) overrides this variable inside
> the `app` service so it points at the `db` service hostname.
>
> `JWT_SECRET_KEY` is **required** - the identity module calls
> `cfg.getOrThrow('JWT_SECRET_KEY')` on boot and the app exits if it is
> missing. Generate one with, for example:
>
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```
>
> `PAYMENT_WEBHOOK_SECRET` signs the payment webhook (HMAC-SHA256). The guard
> fails closed if it is unset, so `POST /api/payments/webhook` returns `401`
> until it is configured. Any caller posting a webhook (a test, a Postman
> collection, or a real gateway adapter) must sign with the same value.

### 3. Install dependencies and generate the Prisma client

```bash
npm install
npm run db:generate
```

### 4. Run the database and apply migrations

```bash
npm run db:up        # starts only the db service
npm run db:migrate   # applies pending migrations
npm run db:seed      # loads sample data
```

### 5. Start the application

You have two options.

**Option A - Local watch mode (recommended for development):**

```bash
npm run start:dev
```

This expects the database to be already up (step 4). The API is then
available at **http://localhost:3000/api**. Swagger UI is exposed at
**http://localhost:3000/api/docs** (development only - disabled when
`NODE_ENV=production`).

**Option B - Full Docker stack (build the image, run migrations + seed via
the container entrypoint):**

```bash
docker compose -f docker-compose.prod.yml up --build
```

On startup, the application container automatically:

1. Runs pending migrations (`prisma migrate deploy`)
2. Runs the database seed (`prisma db seed`)
3. Starts the compiled NestJS server on port `3000`

> The default `docker-compose.yml` only contains the `db` service - it is
> the file used by `npm run db:up`. The `app` service lives in
> `docker-compose.prod.yml`, so the full stack requires the explicit `-f`
> flag.

---

## Local Development

```bash
# Start only the database
npm run db:up

# Start the application in watch mode
npm run start:dev
```

A one-shot helper that resets the local database, regenerates the client,
re-applies migrations, re-seeds and starts the watcher:

```bash
npm run devs
```

> `npm run devs` runs `db:down -v`, which **wipes the local database
> volume**. Never run it against any environment that holds data you care
> about.

---

## Environment Variables

| Variable            | Description                               | Example                      |
| ------------------- | ----------------------------------------- | ---------------------------- |
| `POSTGRES_USER`     | PostgreSQL username                       | `adminuser`                  |
| `POSTGRES_PASSWORD` | PostgreSQL password                       | `secret123`                  |
| `POSTGRES_DB`       | Database name                             | `raizes_do_nordeste`         |
| `DATABASE_URL`      | Full connection string consumed by Prisma | `postgresql://...`           |
| `NODE_ENV`          | Runtime environment                       | `development` / `production` |
| `PORT`              | HTTP server port                          | `3000`                       |
| `JWT_SECRET_KEY`    | Signing secret for access tokens. **Required** - the app exits on boot if missing (`getOrThrow`). | `a-strong-random-secret` |
| `JWT_ACCESS_TTL`    | Lifetime of the short-lived access JWT. Accepts `ms`/`s`/`m`/`h`/`d` suffixes. Default `15m`. | `15m` |
| `JWT_REFRESH_TTL`   | Lifetime of the stateful refresh token. Accepts the same suffixes. Default `7d`. | `7d` |
| `PAYMENT_WEBHOOK_SECRET` | HMAC secret the payment webhook is signed with. If unset, the webhook guard **fails closed** (every callback returns `401`). | `dev-webhook-secret` |

---

## Database

### Domains

| Domain            | Tables                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| Identity & Access | `users`, `refresh_tokens`, `user_business_units`                       |
| Business Units    | `business_units`, `categories`, `products`, `business_unit_menu_items` |
| Audit             | `audit_logs`                                                           |
| Inventory         | `inventory`, `inventory_transactions`                                  |
| Orders            | `orders`, `order_items`                                                |
| Payments          | `payments`                                                             |
| Promotions        | `promotions`, `order_promotions`                                       |
| Loyalty           | `loyalty_accounts`, `loyalty_transactions`                             |

> All domains above now have application code shipped, including **Promotions**
> (`promotions`, `order_promotions`): CRUD use cases, a controller and a Prisma
> repository, plus a published port that applies one promotion per order.

### Design Decisions

- **UUIDs as primary keys** - prevents sequential ID exposure and
  enumeration attacks; safer for distributed systems.
- **camelCase in TypeScript, snake_case in PostgreSQL** - enforced via
  `@map()` and `@@map()` directives so each side follows its own idiomatic
  convention.
- **`Decimal(10, 2)` for monetary values** - avoids floating-point precision
  loss on multiplication and rounding.
- **`DateTime` (TIMESTAMPTZ) for `createdAt`/`updatedAt`** - preserves
  timezone semantics, is human-readable in queries, and Prisma serializes
  it as ISO-8601 to JSON. Numeric Unix timestamps were intentionally
  rejected because they lose precision and timezone meaning.
- **Optional descriptions are `NULL`, not empty strings** - `NULL`
  unambiguously means "no value" and is semantically distinct from an empty
  description, which is a meaningful (but unusual) state.
- **Selective audit trail** - `updated_by` is applied only where
  operationally or legally relevant (e.g. LGPD compliance), avoiding
  pointless metadata noise on append-only tables.
- **Indexed columns by access pattern** - every foreign key and every
  enum-style filter (`isActive`, `orderStatus`, etc.) has an explicit
  `@@index`.

---

## API Reference

All routes are prefixed with **`/api`**.

### Interactive docs (Swagger UI)

When `NODE_ENV` is not `production`, an OpenAPI document and Swagger UI are
exposed at:

- UI - **http://localhost:3000/api/docs**
- JSON - **http://localhost:3000/api/docs-json**

Swagger is disabled in production to avoid leaking schema details. Bearer
auth is wired into the document (`addBearerAuth`) so you can paste a JWT
returned by `POST /api/auth/login` directly into the "Authorize" dialog.

### Authentication

A global `AuthGuard` protects every route by default; routes opt out with
`@Public()`. Only the **product reads**, the **public business-unit reads**
(`GET /api/business-units`, `GET /api/business-units/:id`), the **public menu
reads** (`GET /api/business-units/:businessUnitId/menu`,
`GET /api/business-units/:businessUnitId/menu/:menuItemId`), the **payment
webhook** and **customer self-registration** (`POST /api/users/register`) are
public; everything else needs a `Bearer` JWT in the `Authorization` header. Some
routes additionally require a role via `@Roles()` - `POST /api/products` needs
`ADMIN`/`MANAGER`, `POST /api/business-units` needs `ADMIN`, the business-unit
`internal` reads need `ADMIN`/`MANAGER`, menu management (`POST`, `PATCH` and the
internal manage list under `/api/business-units/:id/menu`) needs
`ADMIN`/`MANAGER`, inventory needs `MANAGER`/`ADMIN`, all
promotion routes need `ADMIN`/`MANAGER`, order listing/status needs staff,
`loyalty/me` needs `CUSTOMER`, and `GET /api/audit-logs` needs `ADMIN`.
`POST /api/orders` needs a JWT but no
fixed role: the requirement is enforced per request by the `orderChannel` policy
(see [Orders](#orders)). A protected route returns `401` when the JWT is missing
or invalid and `403` when the role is insufficient.

Beyond roles, **inventory**, **promotions** and **menu management** routes enforce
unit scope via `UnitScopeGuard`. `ADMIN` bypasses the check (global reach). Any
other role must carry a `businessUnitIds` claim (array) in the JWT that includes
the `:businessUnitId` route param; an empty array or a param not present in the
array returns `404` so the existence of another unit's resources is not disclosed.
Unit scope is set at user creation/update time and is encoded in the token on every
login and refresh.

| Method | Path                | Auth   | Description                                                                      |
| ------ | ------------------- | ------ | ------------------------------------------------------------------------------- |
| `POST` | `/api/auth/login`   | Public | Exchange `username` + `password` for an access + refresh token pair.            |
| `POST` | `/api/auth/refresh` | Public | Exchange a valid refresh token for a new access + refresh pair (token rotation). |
| `POST` | `/api/auth/logout`  | Public | Revoke a refresh token and its entire rotation family. Returns `204 No Content`. |

Request body - `SignInDto` (`password` >= 8 chars):

```json
{ "username": "jane", "password": "min-8-chars" }
```

Response - `200 OK`:

```json
{ "access_token": "eyJhbGciOiJI...", "refresh_token": "..." }
```

Invalid credentials return `401` (see [Error responses](#error-responses)).

Every login attempt - successful **and** failed - is persisted to the
`audit_logs` table by the `AuditService` (`LOGIN_SUCCESS` or `LOGIN_FAILED`
action). Metadata is defensively sanitized: any key matching
`password` / `token` / `cpf` / `authorization` / `secret` (case-insensitive,
recursive) is stored as `[REDACTED]`. Audit persistence failures are
swallowed so they cannot break the login outcome.

#### `POST /api/auth/refresh`

Request body - `RefreshTokenDto`:

```json
{ "refresh_token": "..." }
```

Response - `200 OK` (new access + refresh pair; the presented token is invalidated):

```json
{ "access_token": "eyJhbGciOiJI...", "refresh_token": "..." }
```

An unknown, expired or already-revoked token returns `401` (the condition is not
disclosed). If a revoked token is re-presented, the entire rotation family is
revoked and `TOKEN_REUSE_DETECTED` is written to the audit log. Rate-limited to
5 requests/min.

#### `POST /api/auth/logout`

Request body - `LogoutDto`:

```json
{ "refresh_token": "..." }
```

Response - `204 No Content`. Revokes the supplied refresh token and its entire
rotation family. The already-issued access token is not invalidated and expires
on its own short TTL. Rate-limited to 5 requests/min.

### Users

| Method  | Path                          | Auth            | Description                                                            |
| ------- | ----------------------------- | --------------- | --------------------------------------------------------------------- |
| `POST`  | `/api/users/register`         | Public          | Self-register as a `CUSTOMER`. The role is forced server-side - the body has no role field, so a client cannot grant itself a privileged role. Rate-limited to 5 requests/min. |
| `POST`  | `/api/users`                  | ADMIN / MANAGER | Create a staff or admin user. The target role is gated by a domain policy (see below). A non-admin actor may only bind the new user to units within its own claim. |
| `GET`   | `/api/users`                  | ADMIN / MANAGER | List users (cursor-paginated). Optional `businessUnitId`, `username`, `email` filters (the last two match by case-insensitive substring). `MANAGER` is scoped to its own units; a `businessUnitId` outside the claim returns `404`. |
| `PATCH` | `/api/users/me`               | CUSTOMER        | Update the authenticated customer's own `name` and/or `phone`. At least one field is required; email is out of scope (dedicated endpoint later), password has its own endpoint below. Staff use admin-managed flows. Returns `200`. |
| `PATCH` | `/api/users/me/password`      | Bearer          | Change the authenticated user's own password. `currentPassword` and `newPassword` are required; the new one must be >= 10 chars and meet the strong-password criteria. On success all active refresh tokens are revoked. Returns `204 No Content`. Rate-limited to 5 requests/min. |
| `PATCH` | `/api/users/:id/deactivate`   | ADMIN / MANAGER | Deactivate a user (`is_active = false`, not a soft-delete). `MANAGER` may only act on a target sharing at least one unit; `ADMIN` cannot deactivate itself. Returns `200`. |
| `PATCH` | `/api/users/:id/reactivate`   | ADMIN / MANAGER | Reactivate a user (`is_active = true`). Same target-role and unit-scope policy as deactivate. Returns `200`. |
| `PUT`   | `/api/users/:id/business-units` | ADMIN         | Replace a staff user's unit scope (full replace; the list cannot be empty). `422` if any unit UUID does not exist; the target must be a unit-bound role. Returns `200`. |

#### Changing your own password (`PATCH /api/users/me/password`)

Authenticated self-service; the target user is always derived from the JWT
(`actor.sub`), never from the body or a route param, so you can only change your
own password. Both fields are required:

```json
{ "currentPassword": "OldPass!2024", "newPassword": "N3w-Str0ng-Pass!" }
```

`newPassword` must be >= 10 chars (<= 128) and combine at least 3 of: lowercase,
uppercase, digit, symbol. It must also differ from the current password. The
current password is re-verified before any write (mitigates a stolen access
token), and inactive accounts are rejected with the same generic error as a
wrong password. On success the new hash is persisted and **all** active refresh
tokens are revoked in the same transaction, forcing re-authentication on every
device; the action is audited as `USER_PASSWORD_CHANGED` (never logging the
password). Wrong/inactive current credentials return `401`; reusing the same
password returns `422`.

#### Who may create / deactivate whom (`UserCreationPolicy`)

`@Roles()` is only the coarse gate; the actual target-role check is a pure
domain policy applied inside the use case:

- **ADMIN** may create or deactivate **any** role (including ADMIN).
- **MANAGER** may create or deactivate only **ATTENDANT** and **KITCHEN**.
- Everyone else may create/deactivate nothing.

A disallowed combination returns `403` (`UserCreationForbiddenError`). No one
may deactivate **their own** account - self-deactivation returns `403` even for
an ADMIN (anti-lockout). Deactivating an unknown id returns `404`. A duplicate
`username` / `email` / `phone` on creation returns `409`.

An inactive user can no longer log in: `POST /api/auth/login` rejects an
account with `is_active = false` using the **same** `401` as a wrong password,
so account status is not leaked.

#### Request body - `RegisterCustomerDto` (`POST /api/users/register`)

`name` (<= 120), `username` (3-50 chars, lowercase `a-z0-9._-`), `password`
(>= 8 chars) are required; `email` and `phone` (<= 20) are optional. No `role`
field.

```json
{ "name": "Maria Souza", "username": "maria.souza", "password": "min-8-chars", "email": "maria@example.com" }
```

#### Request body - `CreateUserDto` (`POST /api/users`)

Same fields as registration plus a required `role` (`CUSTOMER` / `ATTENDANT` /
`KITCHEN` / `MANAGER` / `ADMIN`) and an optional `businessUnitIds` (array of
UUIDs). A non-admin actor may only list units within its own claim.

```json
{ "name": "João Atendente", "username": "joao.atendente", "password": "min-8-chars", "role": "ATTENDANT" }
```

#### Response - `UserResponseDto`

The password hash is never serialized.

```json
{
  "id": "cebe6acf-...",
  "username": "maria.souza",
  "name": "Maria Souza",
  "email": "maria@example.com",
  "phone": null,
  "role": "CUSTOMER",
  "businessUnitIds": [],
  "isActive": true
}
```

### Products

| Method | Path                                             | Auth            | Description                                                                                                   |
| ------ | ------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/products`                                  | Public          | List all active products with their base price.                                                               |
| `GET`  | `/api/products/:productId`                       | Public          | Get a single product by id. Returns `404` if missing.                                                         |
| `GET`  | `/api/products/by-business-unit/:businessUnitId` | Public          | List products available at a business unit (effective price = `customPrice` when set, otherwise `basePrice`). |
| `POST` | `/api/products`                                  | ADMIN / MANAGER | Create a product. `201` on success, `409` if the name exists, `404` if the category does not exist.           |
| `PATCH` | `/api/products/:productId/activate`             | ADMIN           | Activate a product (`isActive = true`). Returns `200`; idempotent. `404` if missing.                         |
| `PATCH` | `/api/products/:productId/deactivate`           | ADMIN           | Deactivate a product (`isActive = false`). Returns `200`; idempotent. `404` if missing.                      |

#### Request body - `ProductCreateDto` (`POST /api/products`)

`price` is a **positive decimal string** (up to 8 integer + 2 fractional
digits, matching the `Decimal(10, 2)` column); `imageUrl` must be a valid URL;
`description` is optional.

```json
{
  "name": "Acarajé",
  "description": "Bolinho de feijão-fradinho frito no azeite de dendê",
  "price": "12.50",
  "categoryId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "imageUrl": "https://example.com/images/acaraje.jpg"
}
```

#### Response - `ProductResponseDto`

```json
{
  "id": "cebe6acf-e54e-4842-a8ec-eda9a439ceb5",
  "name": "Açaí Fitness",
  "description": null,
  "price": "20.50",
  "isActive": true,
  "categoryId": "5b8f...",
  "createdAt": "2026-01-01T12:00:00.000Z",
  "updatedAt": "2026-01-01T12:00:00.000Z",
  "imageUrl": "https://example.com/images/acai-fitness.jpg"
}
```

### Business Units

| Method | Path                               | Auth            | Description                                                                                        |
| ------ | ---------------------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/business-units`              | Public          | List active units (cursor-paginated). Public view omits `cnpj`. Optional `search`/`city` filters. |
| `GET`  | `/api/business-units/:id`          | Public          | Get a single active unit. Returns `404` if missing or inactive.                                   |
| `GET`  | `/api/business-units/internal`     | ADMIN / MANAGER | List all units (cursor-paginated), full detail. Optional `search`/`city`/`isActive` filters.      |
| `GET`  | `/api/business-units/internal/:id` | ADMIN / MANAGER | Get a single unit by id, full detail (any status).                                                |
| `POST` | `/api/business-units`              | ADMIN           | Create a unit. `201` on success, `409` if the `cnpj` or `phone` already exists.                   |
| `PATCH` | `/api/business-units/:id/activate`   | ADMIN          | Activate a business unit (`isActive = true`). Returns `200`; idempotent. `404` if missing.        |
| `PATCH` | `/api/business-units/:id/deactivate` | ADMIN          | Deactivate a business unit (`isActive = false`). Returns `200`; idempotent. `404` if missing.     |

#### Request body - `BusinessUnitCreateDto` (`POST /api/business-units`)

`cnpj` is exactly 14 digits, no mask.

```json
{
  "name": "Raízes Pelourinho",
  "cnpj": "12345678000190",
  "address": "Largo do Pelourinho, 10",
  "city": "Salvador",
  "phone": "7132223344"
}
```

#### Response - `BusinessUnitResponseDto` (internal / create)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Raízes Pelourinho",
  "cnpj": "12345678000190",
  "address": "Largo do Pelourinho, 10",
  "city": "Salvador",
  "phone": "7132223344",
  "isActive": true,
  "createdAt": "2026-05-18T10:30:00.000Z",
  "updatedAt": "2026-05-18T10:30:00.000Z"
}
```

#### Response - `PublicBusinessUnitResponseDto` (public reads)

Omits `cnpj`, `isActive` and timestamps.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Raízes Pelourinho",
  "address": "Largo do Pelourinho, 10",
  "city": "Salvador",
  "phone": "7132223344"
}
```

### Menu Items

A menu item links a `Product` to a business unit with a unit-specific
`customPrice`. The menu is scoped per unit (`@@unique(businessUnitId, productId)`).

| Method  | Path                                                              | Auth            | Description                                                                                          |
| ------- | ---------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| `GET`   | `/api/business-units/:businessUnitId/menu`                       | Public          | List available menu items for a unit (cursor-paginated). Only items where the item, its product and the unit are active. |
| `GET`   | `/api/business-units/:businessUnitId/menu/manage`               | ADMIN / MANAGER | List all menu items including unavailable ones (cursor-paginated).                                   |
| `GET`   | `/api/business-units/:businessUnitId/menu/:menuItemId`          | Public          | Get a single available menu item. Returns `404` if missing or unavailable.                          |
| `POST`  | `/api/business-units/:businessUnitId/menu`                      | ADMIN / MANAGER | Add a product to the unit's menu. `201` on success, `409` if it is already on the menu, `404` if the unit or product does not exist. |
| `PATCH` | `/api/business-units/:businessUnitId/menu/:menuItemId`          | ADMIN / MANAGER | Update `customPrice` and/or `isAvailable`. At least one field is required.                           |
| `PATCH` | `/api/business-units/:businessUnitId/menu/:menuItemId/activate`   | ADMIN / MANAGER | Activate a menu item (`isAvailable = true`). Returns `200`; idempotent.                              |
| `PATCH` | `/api/business-units/:businessUnitId/menu/:menuItemId/deactivate` | ADMIN / MANAGER | Deactivate a menu item (`isAvailable = false`). Returns `200`; idempotent.                           |

`customPrice` is the unit-specific price that overrides `Product.basePrice`. It
is **required** on creation - a positive decimal string with up to 2 fractional
digits (same convention as `Product.price`).

#### Request body - `MenuItemCreateDto` (`POST /api/business-units/:businessUnitId/menu`)

`productId` is required (uuid). `customPrice` is required. `isAvailable` is
optional and defaults to `true`. `businessUnitId` comes from the route, never the body.

```json
{ "productId": "cebe6acf-e54e-4842-a8ec-eda9a439ceb5", "customPrice": "22.30" }
```

#### Request body - `MenuItemUpdateDto` (`PATCH /api/business-units/:businessUnitId/menu/:menuItemId`)

Both fields are optional, but at least one must be present.

```json
{ "customPrice": "25.00", "isAvailable": false }
```

Errors follow the standard envelope: `MenuItemAlreadyExistsError` -> `409`,
`MenuItemNotFoundError` -> `404`, `MenuItemsFetchError` -> `503`.

### Orders

| Method  | Path                      | Auth        | Description                                                                                            |
| ------- | ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `POST`  | `/api/orders`             | Bearer      | Create an order. Behavior is driven by the `orderChannel` policy (customer source + role requirement). |
| `GET`   | `/api/orders`             | Staff       | List orders (cursor-paginated) with optional `businessUnitId`/`orderChannel`/`orderStatus` filters. `CUSTOMER` is rejected with `403`. |
| `GET`   | `/api/orders/:id`         | Bearer      | Get one order. A `CUSTOMER` only sees their own; otherwise `404`.                                      |
| `PATCH` | `/api/orders/:id/status`  | Staff       | Advance an order's status. The state machine rejects invalid transitions with `422`; a concurrent change loses the optimistic lock with `409`. |

#### Channel policies

| Channel   | Requires staff actor | `customerId` source          |
| --------- | -------------------- | ---------------------------- |
| `APP`     | No                   | Authenticated user (`sub`)   |
| `WEB`     | No                   | Authenticated user (`sub`)   |
| `TOTEM`   | No                   | Anonymous (`null`)           |
| `COUNTER` | Yes                  | From request body (optional) |
| `PICKUP`  | Yes                  | From request body (optional) |

When the channel requires a staff actor (`COUNTER` / `PICKUP`), a JWT
belonging to a `CUSTOMER` is rejected with `403 AttendantRequiredError`.
For these channels `attendantId` is taken from the JWT (`sub`) - never from
the request body.

#### Request body - `OrderCreateDto`

`unitPrice` is a **decimal string** (`@IsDecimal`, up to 2 fractional digits) -
money is never coerced to a `number`. `totalAmount` is **not** accepted from
the client: it is computed server-side from each item's `quantity x unitPrice`
via domain statics (`OrderItem.calculateSubtotal`, `Order.calculateTotalAmount`).

`unitPrice` is also **validated server-side** against the authoritative price
of the product at the business unit. Resolution order is
`BusinessUnitMenuItem.customPrice` (when a menu item exists for the pair) ->
`Product.basePrice`. A divergence surfaces as `422 PriceMismatchError`, so a
tampered body cannot buy an item for a price different from the registered
one. The same lookup also surfaces `Product.isActive`: an order referencing
an inactive product is rejected with `422 ProductInactiveError` before any
write reaches the database. The `OrderPricing` port returns `{ price, isActive }`
per product; the Prisma implementation batches the product + menu-item
fetches in parallel.

`pointsEarned` is **not** accepted from the client either, and stays `0` on the
order at creation time. Loyalty points are credited later by the loyalty module,
when the payment is **approved**: `floor(paidAmount / 10)` points (1 per R$10),
gated by the customer's `LoyaltyAccount` consent and recorded as a
`LoyaltyTransaction` (the source of truth). The account is created automatically
on the customer's first order. See [Loyalty](#loyalty).

A single eligible promotion for the order's business unit is also applied at
creation: it is priced on the gross items subtotal, the loyalty redemption (if
any) is then priced on the net, and the chosen promotion is persisted as an
`OrderPromotion` in the same transaction. See [Promotions](#promotions).

```json
{
  "businessUnitId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "customerId": "f3b7c2e1-1a2b-3c4d-5e6f-7a8b9c0d1e2f",
  "orderChannel": "COUNTER",
  "pointsRedeemed": 0,
  "notes": "no onions",
  "orderItems": [{ "productId": "b2d8a3b1-...", "quantity": 2, "unitPrice": "12.50" }]
}
```

#### Response - `OrderResponseDto`

Money fields (`totalAmount`, `unitPrice`, `subtotal`) are serialized as a
**decimal string** so JSON cannot reintroduce float rounding on the client.

```json
{
  "id": "0b1c...",
  "businessUnitId": "7c9e...",
  "customerId": "f3b7...",
  "attendantId": "9a2e...",
  "pointsRedeemed": 0,
  "pointsEarned": 0,
  "totalAmount": "25.00",
  "notes": "no onions",
  "orderChannel": "COUNTER",
  "orderStatus": "PENDING",
  "createdAt": "2026-05-30T12:00:00.000Z",
  "updatedAt": "2026-05-30T12:00:00.000Z",
  "updatedById": null,
  "orderItems": [
    {
      "id": "2f9b...",
      "productId": "b2d8...",
      "quantity": 2,
      "unitPrice": "12.50",
      "subtotal": "25.00",
      "notes": null
    }
  ]
}
```

A foreign key pointing to a missing business unit, customer, attendant or
product surfaces as `404 OrderReferenceNotFoundError` - `PrismaOrderRepository`
translates Prisma's `P2003` into a typed domain error and inspects
`err.meta.field_name` to produce a message that names the specific reference
(`customer`, `business unit`, `product`, `attendant`) instead of grouping all
foreign-key failures under one generic label.

#### Order status transitions

`PATCH /api/orders/:id/status` enforces a forward-only state machine
(`OrderStatus` VO). Allowed moves:

- `PENDING` -> `CONFIRMED` | `CANCELLED`
- `CONFIRMED` -> `PREPARING` | `CANCELLED`
- `PREPARING` -> `READY` | `CANCELLED`
- `READY` -> `DELIVERED`
- `DELIVERED` and `CANCELLED` are terminal

An invalid transition returns `422`; an unknown order returns `404`; a
concurrent transition that loses the optimistic lock returns `409`. An
approved payment advances `PENDING -> CONFIRMED` automatically (see below).

### Payments

| Method | Path                           | Auth           | Description                                                    |
| ------ | ------------------------------ | -------------- | -------------------------------------------------------------- |
| `POST` | `/api/payments`                | Bearer         | Create a payment for an order and charge the gateway.          |
| `POST` | `/api/payments/webhook`        | HMAC signature | Gateway callback: settle a payment and advance its order.      |
| `GET`  | `/api/orders/:orderId/payment` | Bearer         | Get the payment of an order. Customers may only see their own. |

#### The webhook is the source of truth

Payment confirmation follows the asynchronous-gateway model used in production
processors (Stripe, Mercado Pago): `POST /api/payments` charges the gateway and
persists the payment as **`PROCESSING`**, but the order is **not** advanced yet.
The gateway then calls back `POST /api/payments/webhook`, and only that callback
settles the payment to `APPROVED`/`REFUSED`. On approval the order is advanced to
`CONFIRMED` **in the same database transaction** as the payment update, so the two
never drift apart. The webhook is idempotent: a redelivered callback for an
already-settled payment is a no-op.

> **Cross-context note.** Payments never imports the `Order` entity. The orders
> context publishes an `OrderForPayment` port (a TypeScript interface + `Symbol`
> token, the same mechanism as `AUDIT_LOGGER`) exposing only what payments needs:
> read the order's payable state/total, and confirm it after approval. The order
> confirmation reuses the existing order state machine and optimistic lock.

#### Request body - `CreatePaymentDto` (`POST /api/payments`)

`amount` is **not** accepted from the client: it is the order's authoritative
`totalAmount`, read server-side (anti-tampering, mirroring `unitPrice` on orders).
An order that is not `PENDING`, or that already has a payment, is rejected with
`422 OrderNotPayableError` (the `payments.order_id` unique constraint also guards
the concurrent double-payment race).

```json
{ "orderId": "7c9e6679-7425-40de-944b-e07fc1f90ae7", "method": "PIX" }
```

#### Request body - `PaymentWebhookDto` (`POST /api/payments/webhook`)

The callback is verified by an HMAC-SHA256 signature (not a static shared
secret), so a captured request cannot be replayed and the body cannot be
tampered. The caller sends two headers:

- **`x-webhook-timestamp`** - Unix seconds; rejected if more than 300s from now
  (anti-replay window).
- **`x-webhook-signature`** - hex HMAC-SHA256, keyed with `PAYMENT_WEBHOOK_SECRET`,
  over the canonical string `timestamp.extTransactionId.status.amount`.

A missing/invalid signature, a stale timestamp, or an unset server secret all
return `401`. `status` is the settled outcome (`APPROVED` / `REFUSED`) and
`amount` must match what was charged. The signing helper `buildWebhookSignature`
is exported from the webhook guard for tests and future PSP adapters.

```json
{ "extTransactionId": "mock_4f1c...", "status": "APPROVED", "amount": "25.00" }
```

#### Response - `PaymentResponseDto`

`amount` is serialized as a **decimal string** so JSON cannot reintroduce float
rounding on the client.

```json
{
  "id": "9b2e...",
  "orderId": "7c9e...",
  "amount": "25.00",
  "method": "PIX",
  "status": "PROCESSING",
  "extTransactionId": "mock_4f1c...",
  "createdAt": "2026-05-31T12:00:00.000Z",
  "updatedAt": "2026-05-31T12:00:00.000Z"
}
```

> **Mock gateway.** The bundled `MockPaymentGateway` simulates ~200 ms of latency
> and **refuses any charge of exactly `13.13`**, approving everything else - a
> deterministic hook for exercising the failure path in tests.

> **Note on order status (idiomatic deviation).** The sprint brief described the
> post-payment state as `EM_PREPARO` ("preparing"). The codebase is English-only
> and an approved payment advances the order to **`CONFIRMED`**: a payment
> _confirms_ an order, while `PREPARING` stays the kitchen's explicit human
> acceptance. `PENDING -> CONFIRMED` was already a valid transition, so the state
> machine was not changed.

### Inventory

| Method | Path                                | Auth            | Description                                              |
| ------ | ----------------------------------- | --------------- | ------------------------------------------------------- |
| `GET`  | `/api/inventory/:businessUnitId`    | MANAGER / ADMIN | List stock balances for a business unit.                |
| `POST` | `/api/inventory/:businessUnitId/adjust` | MANAGER / ADMIN | Apply a manual `IN`/`OUT` stock movement.           |

Stock is a management concern: `ATTENDANT`, `KITCHEN` and `CUSTOMER` are
rejected with `403`. Access is also unit-scoped: `ADMIN` sees any unit;
`MANAGER` must carry the `:businessUnitId` param in its `businessUnitIds` claim
(param not in the array, or an empty claim -> `404`). Every balance change is recorded as an
`InventoryTransaction` (the balance is never mutated blind).

#### Stock is deducted when an order is created

`POST /api/orders` deducts stock for each item **in the same transaction** as
the order insert. An item without an inventory row at the unit, or without
enough on hand, fails the whole order with `422` and rolls back every deduction
already applied (no partial outflow). When a deduction leaves the balance at or
below `minQuantity`, a `STOCK_ALERT` is written to the audit log.

#### Request body - `AdjustInventoryDto` (`POST /api/inventory/:businessUnitId/adjust`)

`type` is `IN` (restock) or `OUT` (manual removal). An `IN` for a product with
no inventory row at the unit returns `404`; an `OUT` that would drive the
balance below zero returns `422`.

```json
{ "productId": "cebe6acf-...", "type": "IN", "quantity": 10, "reason": "Weekly restock delivery." }
```

#### Response - `InventoryResponseDto`

```json
{
  "id": "a1b2...",
  "businessUnitId": "e36e29da-...",
  "productId": "cebe6acf-...",
  "quantity": 110,
  "minQuantity": 5,
  "updatedAt": "2026-06-14T12:00:00.000Z"
}
```

### Loyalty

| Method | Path              | Auth     | Description                                          |
| ------ | ----------------- | -------- | --------------------------------------------------- |
| Method   | Path                      | Auth     | Description                                          |
| -------- | ------------------------- | -------- | --------------------------------------------------- |
| `GET`    | `/api/loyalty/me`         | CUSTOMER | Get the authenticated customer's loyalty account.   |
| `POST`   | `/api/loyalty/me/consent` | CUSTOMER | Grant LGPD consent for the loyalty program. Idempotent upsert: creates the account if the customer has never ordered. Returns `200`. |
| `DELETE` | `/api/loyalty/me/consent` | CUSTOMER | Withdraw LGPD consent. Sets `consentGiven = false` and records `consentRevokedAt`. Returns `200`; `404` if no account exists yet. |

A customer's `LoyaltyAccount` is created automatically on their **first order**
(with `consentGiven = false`), or eagerly via `POST /api/loyalty/me/consent`.
`GET /api/loyalty/me` returns `404` for a customer who has never ordered, and
`403` for staff. Points are credited only when a payment is **approved**, only
if the account has `consentGiven = true` (LGPD gate): `floor(paidAmount / 10)`
points (1 point per R$10), recorded as a `LoyaltyTransaction` of type `EARN`.
Consent can be granted and withdrawn at will; withdrawal stamps `consentRevokedAt`
and stops future earn/redeem without touching already-accrued points. Each grant
and revoke is recorded in the audit log (`LOYALTY_CONSENT_GIVEN` /
`LOYALTY_CONSENT_REVOKED`). Redemption runs at order creation: the
client sends `pointsRedeemed` on the order, each point is worth `R$0.10` off the
total, and the balance is validated and debited (optimistically) in the same
transaction as the order, recorded as a `REDEEM` `LoyaltyTransaction`.

#### Response - `LoyaltyAccountResponseDto`

```json
{
  "id": "a1c4...",
  "customerId": "f3b7...",
  "totalPoints": 12,
  "consentGiven": true,
  "consentDate": "2026-06-28T12:00:00.000Z",
  "consentRevokedAt": null,
  "createdAt": "2026-06-01T09:30:00.000Z"
}
```

### Promotions

| Method  | Path                                               | Auth          | Description                                   |
| ------- | -------------------------------------------------- | ------------- | --------------------------------------------- |
| `POST`  | `/api/promotions`                                  | ADMIN/MANAGER | Create a promotion for a business unit.       |
| `GET`   | `/api/promotions/by-business-unit/:businessUnitId` | ADMIN/MANAGER | List a unit's promotions (cursor-paginated).  |
| `GET`   | `/api/promotions/:promotionId`                     | ADMIN/MANAGER | Get one promotion by ID.                      |
| `PATCH` | `/api/promotions/:promotionId`                     | ADMIN/MANAGER | Update a promotion.                           |

Promotions carry a `discountType` (`PERCENTAGE` or `FIXED_AMOUNT`), a
`discountValue`, a `minOrderValue` floor, and a `startDate`/`endDate` window.
`FREE_ITEM` is rejected (the schema does not model a target item to price).
`businessUnitId` is **required in the request body** for `POST /api/promotions`;
the use case validates it against the actor's `businessUnitIds` JWT claim, so a
manager cannot create a promotion for a unit outside its scope (`ADMIN` bypasses
the check). All promotion routes are protected by `UnitScopeGuard`: a non-admin
staff member can only create, read and update promotions for units in their claim;
a mismatch or an empty claim returns `404` so the existence of another unit's
promotions is not disclosed.

At most **one** promotion applies per order (MVP). On order creation the
promotion is priced against the **gross** items subtotal first, then loyalty
redemption is priced against the **net** (subtotal - promo); the chosen
promotion is recorded as an `OrderPromotion` row in the same transaction, with
only its own parcel in `discountApplied`.

#### Request body - `CreatePromotionDto` (`POST /api/promotions`)

```json
{
  "businessUnitId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "name": "Almoço executivo",
  "discountType": "PERCENTAGE",
  "discountValue": "10.00",
  "minOrderValue": "30.00",
  "startDate": "2026-06-01T00:00:00.000Z",
  "endDate": "2026-06-30T23:59:59.000Z",
  "isActive": true
}
```

For `PERCENTAGE`, `discountValue` is the percent as a decimal (`"10.00"` = 10%);
for `FIXED_AMOUNT` it is the BRL amount. Money fields are decimal strings,
mirroring the rest of the API.

### Audit Logs

| Method | Path              | Auth  | Description                                                           |
| ------ | ----------------- | ----- | -------------------------------------------------------------------- |
| `GET`  | `/api/audit-logs` | ADMIN | List audit log entries (cursor-paginated). All query params optional. |

#### Query parameters

| Parameter  | Type   | Description                                              |
| ---------- | ------ | ------------------------------------------------------- |
| `from`     | string | ISO-8601 date-time lower bound (inclusive).             |
| `to`       | string | ISO-8601 date-time upper bound (inclusive).             |
| `userId`   | string | UUID of the user who triggered the event.               |
| `action`   | string | Audit action name (e.g. `LOGIN_SUCCESS`).               |
| `entity`   | string | Entity type name (e.g. `Order`).                        |
| `entityId` | string | UUID of the affected entity.                            |

Response uses the standard cursor-paginated envelope `{ data: [...], meta: { ... } }`.

### Error responses

Every error passes through the global exception filter and is returned with a
**single consistent envelope**. Internal details (stack, `Error.cause` chain)
are logged server-side but never sent to the client:

```json
{
  "statusCode": 503,
  "error": "Service Unavailable",
  "message": "Could not retrieve active products.",
  "path": "/api/products",
  "timestamp": "2026-05-17T12:00:00.000Z"
}
```

| Status | When                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| `400`  | Request body fails validation (`class-validator` + `ValidationPipe`)                                                  |
| `401`  | Invalid login credentials, missing/invalid JWT, or a webhook with a missing/invalid/stale signature                   |
| `403`  | Authenticated but the role is not allowed (e.g. a `CUSTOMER` creating a `COUNTER` order, or a role creating/deactivating a user it may not - `UserCreationForbiddenError`) |
| `404`  | Requested product/order/payment does not exist, or an order references a missing reference                            |
| `409`  | A unique field already exists - a product name (`ProductAlreadyExistsError`) or a user's username/email/phone (`UserAlreadyExistsError`) |
| `422`  | An order references an inactive product / mismatched `unitPrice`, or an order is not payable (`OrderNotPayableError`) |
| `503`  | Repository / database failure (`ProductsFetchError`)                                                                  |

Application and domain errors carry a transport-agnostic `kind` that the filter
maps to a status: `not-found` -> 404, `invalid` -> 422, `conflict` -> 409,
`unauthorized` -> 401, `forbidden` -> 403, `unavailable` -> 503. Use cases throw
these (e.g. `ProductNotFoundError`, `InvalidCredentialsError`) instead of HTTP
exceptions, keeping the application layer framework-agnostic. NestJS
`HttpException`s raised by the framework itself - the `AuthGuard` (`401`/`403`)
and the validation pipe (`400`) - keep their own status and are re-wrapped into
the same envelope.

---

## Testing

```bash
# Unit tests (use cases, controllers, entities, DTOs)
npm test

# Watch mode
npm run test:watch

# Coverage report -> ./coverage/lcov-report/index.html
npm run test:cov

# End-to-end tests (boots the full Nest application)
npm run test:e2e
```

### Testing strategy

- **Unit tests** substitute the repository interfaces (`ProductRepository`,
  `UserRepository`, `OrderRepository`, `PaymentRepository`, `InventoryRepository`,
  `LoyaltyRepository`) with test doubles, so use cases and the `AuthGuard` are
  validated without any database. Entities, value objects, DTOs and the global
  exception filter are tested in isolation.
- **e2e tests** boot the full Nest application against the development database
  and exercise the HTTP surface - products (`app.e2e-spec.ts`), login +
  audit-log persistence (`auth-audit.e2e-spec.ts`), global validation rejection
  (`validation-pipe.e2e-spec.ts`), the global error envelope via a throwing
  repository (`global-error-filter.e2e-spec.ts`), orders + stock deduction +
  loyalty enrolment (`orders.e2e-spec.ts`), and critical flow A - order, pay,
  webhook, confirm - with the points and reconciliation paths
  (`payments.e2e-spec.ts`).
- Each test asserts both **success paths** and **failure paths**.

### Manual / smoke tests

[`docs/TESTS.md`](docs/TESTS.md) documents the smoke-test scenarios (6 positive,
4 negative) covering login, order creation, payment + webhook, status
transitions, the menu listing and stock deduction. Each scenario maps to a
request in the Postman collection; run it with the Postman Runner or
`newman run <collection>.json -e <env>.json` - the app must be up, the seed
loaded, and `PAYMENT_WEBHOOK_SECRET` set to the same value the collection signs
with.

---

## Code Quality

- **ESLint** (`eslint.config.mjs`) with `typescript-eslint` strict-typed
  rules, `no-explicit-any: error`, `no-floating-promises: error`,
  `eqeqeq: error`, `curly: error`.
- **Prettier** (`.prettierrc`) - single quotes, 100-column width,
  trailing commas everywhere.
- **Husky + lint-staged** - pre-commit hook runs ESLint and Prettier on
  staged TypeScript files only.
- **GitHub Actions CI** (`.github/workflows/ci.yml`) - installs
  dependencies, generates the Prisma client, lints, tests and builds on
  every push to `main`/`develop` and on every PR to `main`.

---

## Roadmap

The catalog, identity, audit, orders, payments, inventory, loyalty and
promotions modules are shipped. Remaining work (per-module follow-ups below):

- [x] **Auth** - JWT login, global role guard, argon2 hashing (`CUSTOMER`,
      `ATTENDANT`, `KITCHEN`, `MANAGER`, `ADMIN`), public customer
      self-registration, policy-gated user creation/deactivation, an
      inactive-account login block, and refresh-token rotation with reuse
      detection and logout.
- [x] **Business Units / Catalog** - business-unit CRUD (public active-only
      list, public single, internal full list/single, `ADMIN` creation), product
      catalog (public list, public single, by-unit list, staff creation), and
      per-unit menu management (`AddMenuItem`, `UpdateMenuItem`,
      `DeactivateMenuItem`, `GetMenuByBusinessUnit`, `GetMenuItemById`).
      `customPrice` is required and overrides `Product.basePrice` per unit.
      Management routes (add, update, deactivate, manage-list) are unit-scoped
      via `UnitScopeGuard`: the `:businessUnitId` param is validated against the
      actor's JWT claim. The same guard now covers inventory and promotions routes.
- [x] **Audit** - `audit_logs` table, `AuditService` with metadata
      sanitization (password/token/CPF redaction), `AuditLogger` port injected
      into the login, order, payment and inventory flows, and `GET /api/audit-logs`
      (ADMIN-only, cursor-paginated, filterable by `from`/`to`, `userId`, `action`,
      `entity` and `entityId`).
- [x] **Orders** - channel-aware creation, cursor-paginated reads, owner-scoped
      single read, and a status state machine (optimistic-locked transitions).
      Decimal-string money, server-side total, `unitPrice` anti-tampering and
      `Product.isActive` enforcement. Item updates and idempotent creation
      still pending.
- [x] **Payments** - mock gateway charge, HMAC-signed webhook that confirms the
      order in the same transaction, and a sweeper that expires stale
      `PROCESSING` payments. Refunds still pending.
- [x] **Inventory** - per-unit stock, an `InventoryTransaction` ledger, atomic
      deduction on order creation, manual `IN`/`OUT` adjustments, and a
      `STOCK_ALERT` audit on low balance. Reservations still pending.
- [x] **Promotions** - percentage / fixed-amount discounts, CRUD (create / list
      by business unit / get / update) and at most one promotion applied per
      order, priced on the gross subtotal before the loyalty discount and
      recorded as an `OrderPromotion` in the same transaction. `FREE_ITEM`,
      coupon codes and a unique `(orderId, promotionId)` index are out of MVP
      scope.
- [x] **Loyalty** - auto-enrolment on the first order, consent tracking (LGPD),
      `floor(paidAmount / 10)` points credited on approved payments, and
      redemption at order creation (1 point = `R$0.10` discount), balance-validated
      and debited in the same transaction.

---

## License

Academic project - all rights reserved.
