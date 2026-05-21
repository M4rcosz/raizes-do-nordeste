# Raízes do Nordeste — Backend API

[![CI](https://github.com/M4rcosz/raizes-do-nordeste/actions/workflows/ci.yml/badge.svg)](https://github.com/M4rcosz/raizes-do-nordeste/actions/workflows/ci.yml)

REST API for a multi-unit restaurant ordering system. The platform powers menu
browsing, order management, payment processing, inventory control and a
customer loyalty program — across multiple business units (franchises).

> **Status:** the project is being built incrementally. The shipped surface
> is the product catalog, identity (JWT login + argon2 hashing + global role
> guard), and a cross-cutting audit log wired into the login flow. Orders,
> payments, inventory, promotions and loyalty are planned (see
> [Roadmap](#roadmap)).

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

The codebase follows **Clean Architecture organized by bounded context** — each
business context owns its own four-layer stack, and dependencies point strictly
inwards (infrastructure → application → domain).

```
   ┌────────────────────────────────────────────────────────┐
   │                       API Layer                        │  HTTP edge
   │  (NestJS controllers, guards, pipes, exception filters)│
   └───────────────────────────┬────────────────────────────┘
                               │ depends on
   ┌───────────────────────────▼────────────────────────────┐
   │                    Application Layer                   │  Orchestration
   │            (Use Cases — one per business action)       │
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

> **Heads-up — structural change mid-project (May 2026):** the codebase was
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
The `domain/` layer of each context contains pure TypeScript — no NestJS, no
Prisma, no framework imports. This keeps business rules portable and trivial
to unit test. Use cases, however, use `@Injectable()` so the DI container can
wire them up — this is a deliberate, accepted compromise for ergonomics.

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
Money is represented as [`big.js`](https://github.com/MikeMcl/big.js) inside
the domain (avoiding IEEE-754 rounding errors) and as `Decimal(12, 2)` in
PostgreSQL. DTOs convert to `number` only at the HTTP edge.

**6. Errors model intent, not transport**

- Domain and application errors extend shared base classes
  (`DomainError` / `ApplicationError`) that carry a transport-agnostic
  `kind` (`not-found`, `invalid`, `conflict`, `unauthorized`, `forbidden`,
  `unavailable`) — never an HTTP status.
- A global exception filter (`shared/filter/`, registered via `APP_FILTER`)
  is the single place that maps `kind` → HTTP status, re-wraps NestJS
  `HttpException`s, and emits one consistent JSON envelope. It logs the full
  `Error.cause` chain server-side but never leaks internals to the client.
- `ProductsFetchError` (application layer) wraps the underlying repository
  failure with the standard `Error.cause` option and `kind: unavailable`.

**7. `shared/` is the cross-context kernel**
Anything reused across two or more contexts (Prisma client lifecycle,
pagination primitives, future `Money`/`Email` value objects, global guards
and interceptors) lives in `src/shared/`. If something is used by only one
context, it stays inside that context.

**8. Cross-context capabilities are exposed via published ports**
A bounded context that needs to be **consumed** by other contexts (e.g.
`audit`) publishes a port — a TypeScript `interface` plus a `Symbol` DI
token — in its `application/ports/` folder, and binds the token to its
implementation in its NestJS module's `providers` / `exports`. Consumers
inject the token and depend on the interface only; they never import
entities or repositories from another context's `domain/`. This is the
mechanism behind `AUDIT_LOGGER`: `SignInUseCase` (in `identity`) injects
the port without knowing that the concrete `AuditService` lives in
`modules/audit/`. The same shape will be reused when future order /
payment use cases need to log audit entries.

**9. Path aliases for cross-boundary imports**
Imports that cross a context boundary use TypeScript path aliases:

- `@shared/*` → `src/shared/*`
- `@modules/*` → `src/modules/*`

Imports **inside** the same bounded context stay relative
(`../domain/entities/product.entity`). The alias is a visual signal that
the import crosses a context boundary; a relative path documents that the
dependency stays local. This is a convention, not a lint rule — review for
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

**10. Build pipeline — SWC with `tsc` type-check sidecar**
`nest build` uses [SWC](https://swc.rs/) (configured in `nest-cli.json`
under `compilerOptions.builder`) instead of `tsc`. SWC compiles each file
in parallel — roughly 10× faster on this codebase — and resolves path
aliases natively, so `dist/` contains real relative paths and no runtime
alias resolver is needed.

SWC reads its own configuration from a top-level `.swcrc` file. We keep
that file minimal: it declares only `jsc.baseUrl` and `jsc.paths` so SWC
has its own source of truth for alias resolution and does not try to
recombine the tsconfig values. The decorator and `emitDecoratorMetadata`
behavior NestJS needs comes from the defaults that the `@nestjs/cli`
SWC integration injects — replicating them in `.swcrc` would just be
duplication.

SWC does not perform type checking. The `typeCheck: true` flag in
`nest-cli.json` runs `tsc --noEmit` alongside the SWC compile so type
errors still fail the build.

> ⚠️ **Caveat — circular imports + SWC.** Because SWC compiles each file
> in isolation, it can mis-emit `design:type` reflection metadata when two
> files reference each other across a decorator boundary (`@Injectable()`,
> `class-validator`, decorator-driven ORMs). The build succeeds; the bug
> surfaces only at runtime (DI injects `undefined`, validator silently
> skipped, ORM loses the relation).
>
> **Low risk for this project today** — Prisma does not rely on
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
> imports — they are erased at runtime and break many cycles automatically;
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
│   ├── filter/                   ← Global exception filter (error → envelope)
│   ├── infrastructure/
│   │   └── prisma/               ← @Global() PrismaService + lifecycle
│   └── pagination/               ← Cursor-pagination types and DTO envelope
└── modules/                      ← One folder per bounded context
    ├── audit/                    ← Cross-cutting audit logging
    │   ├── audit.module.ts
    │   ├── domain/               ← AuditAction const, IAuditLogRepository
    │   ├── application/          ← AuditService (impl), IAuditLogger port, errors
    │   └── infrastructure/       ← PrismaAuditLogRepository
    ├── business-units/           ← Products, Categories, Menu Items, Units
    │   ├── business-units.module.ts
    │   ├── domain/               ← Pure rules (no framework imports)
    │   │   ├── entities/         ← Product, BusinessUnitMenuItem
    │   │   └── repositories/     ← Interfaces + DI tokens
    │   ├── application/          ← Orchestration
    │   │   ├── use-cases/        ← One file per business action
    │   │   └── errors/           ← App-layer errors (extend shared ApplicationError)
    │   └── infrastructure/       ← Adapters
    │       ├── persistence/      ← Prisma repository implementations
    │       └── http/
    │           ├── controllers/  ← NestJS controllers
    │           └── dto/          ← Response DTOs (serialization only)
    └── identity/                 ← Users, JWT auth, login, roles
        ├── identity.module.ts
        ├── domain/               ← User entity, repo + hasher/signer ports, UserRole
        ├── application/          ← SignInUseCase + app-layer errors
        └── infrastructure/       ← Argon2 hasher, JWT signer, auth controller/DTO
prisma/
├── schema.prisma                 ← Single source of truth for the database
├── seed.ts                       ← Idempotent seed for local dev
└── migrations/                   ← Versioned migration history
test/
├── app.e2e-spec.ts               ← Product HTTP e2e
├── auth-audit.e2e-spec.ts        ← Login + audit_logs persistence e2e
├── validation-pipe.e2e-spec.ts   ← Global ValidationPipe e2e
└── global-error-filter.e2e-spec.ts ← Error envelope e2e (full pipeline)
```

> Remaining contexts (`inventory`, `orders`, `payments`, `promotions`,
> `loyalty`) will follow the same internal shape under `src/modules/`.

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
```

> ⚠️ `DATABASE_URL` uses `localhost` for local development. The full-stack
> Docker compose (`docker-compose.prod.yml`) overrides this variable inside
> the `app` service so it points at the `db` service hostname.
>
> 🔑 `JWT_SECRET_KEY` is **required** — the identity module calls
> `cfg.getOrThrow('JWT_SECRET_KEY')` on boot and the app exits if it is
> missing. Generate one with, for example:
>
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

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

**Option A — Local watch mode (recommended for development):**

```bash
npm run start:dev
```

This expects the database to be already up (step 4). The API is then
available at **http://localhost:3000/api**. Swagger UI is exposed at
**http://localhost:3000/api/docs** (development only — disabled when
`NODE_ENV=production`).

**Option B — Full Docker stack (build the image, run migrations + seed via
the container entrypoint):**

```bash
docker compose -f docker-compose.prod.yml up --build
```

On startup, the application container automatically:

1. Runs pending migrations (`prisma migrate deploy`)
2. Runs the database seed (`prisma db seed`)
3. Starts the compiled NestJS server on port `3000`

> ℹ️ The default `docker-compose.yml` only contains the `db` service — it is
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

> ⚠️ `npm run devs` runs `db:down -v`, which **wipes the local database
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

---

## Database

### Domains

| Domain            | Tables                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| Identity & Access | `users`                                                                |
| Business Units    | `business_units`, `categories`, `products`, `business_unit_menu_items` |
| Audit             | `audit_logs`                                                           |
| Inventory         | `inventory`, `inventory_transactions`                                  |
| Orders            | `orders`, `order_items`                                                |
| Payments          | `payments`                                                             |
| Promotions        | `promotions`, `order_promotions`                                       |
| Loyalty           | `loyalty_accounts`, `loyalty_transactions`                             |

> Of the domains above, **Identity, Business Units and Audit** have application
> code shipped. The remaining tables (Inventory, Orders, Payments, Promotions,
> Loyalty) exist in the schema as forward-looking infrastructure — there are no
> use cases, controllers or repositories for them yet.

### Design Decisions

- **UUIDs as primary keys** — prevents sequential ID exposure and
  enumeration attacks; safer for distributed systems.
- **camelCase in TypeScript, snake_case in PostgreSQL** — enforced via
  `@map()` and `@@map()` directives so each side follows its own idiomatic
  convention.
- **`Decimal(10, 2)` for monetary values** — avoids floating-point precision
  loss on multiplication and rounding.
- **`DateTime` (TIMESTAMPTZ) for `createdAt`/`updatedAt`** — preserves
  timezone semantics, is human-readable in queries, and Prisma serializes
  it as ISO-8601 to JSON. Numeric Unix timestamps were intentionally
  rejected because they lose precision and timezone meaning.
- **Optional descriptions are `NULL`, not empty strings** — `NULL`
  unambiguously means "no value" and is semantically distinct from an empty
  description, which is a meaningful (but unusual) state.
- **Selective audit trail** — `updated_by` is applied only where
  operationally or legally relevant (e.g. LGPD compliance), avoiding
  pointless metadata noise on append-only tables.
- **Indexed columns by access pattern** — every foreign key and every
  enum-style filter (`isActive`, `orderStatus`, etc.) has an explicit
  `@@index`.

---

## API Reference

All routes are prefixed with **`/api`**.

### Interactive docs (Swagger UI)

When `NODE_ENV` is not `production`, an OpenAPI document and Swagger UI are
exposed at:

- UI — **http://localhost:3000/api/docs**
- JSON — **http://localhost:3000/api/docs-json**

Swagger is disabled in production to avoid leaking schema details. Bearer
auth is wired into the document (`addBearerAuth`) so you can paste a JWT
returned by `POST /api/auth/login` directly into the "Authorize" dialog.

### Authentication

A global `AuthGuard` protects every route by default; routes opt out with
`@Public()`. **Every endpoint shipped so far is public.** Protected routes
(none yet) will require a `Bearer` JWT in the `Authorization` header and may
further restrict by role via `@Roles()`.

| Method | Path              | Auth   | Description                                 |
| ------ | ----------------- | ------ | ------------------------------------------- |
| `POST` | `/api/auth/login` | Public | Exchange `username` + `password` for a JWT. |

Request body — `SignInDto` (`password` ≥ 8 chars):

```json
{ "username": "jane", "password": "min-8-chars" }
```

Response — `200 OK`:

```json
{ "access_token": "eyJhbGciOiJI..." }
```

Invalid credentials return `401` (see [Error responses](#error-responses)).

Every login attempt — successful **and** failed — is persisted to the
`audit_logs` table by the `AuditService` (`LOGIN_SUCCESS` or `LOGIN_FAILED`
action). Metadata is defensively sanitized: any key matching
`password` / `token` / `cpf` / `authorization` / `secret` (case-insensitive,
recursive) is stored as `[REDACTED]`. Audit persistence failures are
swallowed so they cannot break the login outcome.

### Products

| Method | Path                                             | Description                                                                                                   |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/products`                                  | List all active products with their base price.                                                               |
| `GET`  | `/api/products/:productId`                       | Get a single product by id. Returns `404` if missing.                                                         |
| `GET`  | `/api/products/by-business-unit/:businessUnitId` | List products available at a business unit (effective price = `customPrice` when set, otherwise `basePrice`). |

#### Response — `ProductResponseDto`

```json
{
  "id": "cebe6acf-e54e-4842-a8ec-eda9a439ceb5",
  "name": "Açaí Fitness",
  "description": null,
  "price": 20.5,
  "isActive": true,
  "categoryId": "5b8f...",
  "createdAt": "2026-01-01T12:00:00.000Z",
  "updatedAt": "2026-01-01T12:00:00.000Z"
}
```

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

| Status | When                                                                   |
| ------ | ---------------------------------------------------------------------- |
| `400`  | Request body fails validation (`class-validator` + `ValidationPipe`)   |
| `401`  | Invalid login credentials, or missing/invalid JWT on a protected route |
| `404`  | Requested product does not exist                                       |
| `503`  | Repository / database failure (`ProductsFetchError`)                   |

Application/domain errors carry a `kind` that the filter maps to a status:
`not-found` → 404, `invalid` → 422, `conflict` → 409, `unauthorized` → 401,
`forbidden` → 403, `unavailable` → 503. NestJS `HttpException`s (e.g.
`NotFoundException`, validation `BadRequestException`) keep their own status
and are re-wrapped into the same envelope.

---

## Testing

```bash
# Unit tests (use cases, controllers, entities, DTOs)
npm test

# Watch mode
npm run test:watch

# Coverage report → ./coverage/lcov-report/index.html
npm run test:cov

# End-to-end tests (boots the full Nest application)
npm run test:e2e
```

### Testing strategy

- **Unit tests** substitute the repository interfaces (`IProductRepository`,
  `IUserRepository`) with test doubles, so use cases and the `AuthGuard` are
  validated without any database. Entities, DTOs and the global exception
  filter are tested in isolation.
- **e2e tests** boot the full Nest application against the development
  database and exercise the HTTP surface — products
  (`app.e2e-spec.ts`), login + audit-log persistence
  (`auth-audit.e2e-spec.ts`), global validation rejection
  (`validation-pipe.e2e-spec.ts`), and the global error envelope via a
  throwing repository (`global-error-filter.e2e-spec.ts`).
- Each test asserts both **success paths** and **failure paths** — including
  `NotFoundException` propagation and `ProductsFetchError` wrapping
  with `Error.cause`.

---

## Code Quality

- **ESLint** (`eslint.config.mjs`) with `typescript-eslint` strict-typed
  rules, `no-explicit-any: error`, `no-floating-promises: error`,
  `eqeqeq: error`, `curly: error`.
- **Prettier** (`.prettierrc`) — single quotes, 100-column width,
  trailing commas everywhere.
- **Husky + lint-staged** — pre-commit hook runs ESLint and Prettier on
  staged TypeScript files only.
- **GitHub Actions CI** (`.github/workflows/ci.yml`) — installs
  dependencies, generates the Prisma client, lints, tests and builds on
  every push to `main`/`develop` and on every PR to `main`.

---

## Roadmap

The product catalog, identity and audit modules are shipped. Upcoming
modules — already designed in the database schema — are:

- [x] **Auth** — JWT login, global role guard, argon2 hashing (`CUSTOMER`,
      `ATTENDANT`, `KITCHEN`, `MANAGER`, `ADMIN`). Refresh-token rotation
      and user registration still pending.
- [x] **Audit** — `audit_logs` table, `AuditService` with metadata
      sanitization (password/token/CPF redaction), `IAuditLogger` port
      injected into `SignInUseCase` for `LOGIN_SUCCESS` / `LOGIN_FAILED`.
      Ready to be injected into future order / payment use cases.
- [ ] **Orders** — order creation, item management, status transitions
- [ ] **Payments** — gateway integration (mocked initially), refund flow
- [ ] **Inventory** — stock, reservations, inventory transactions ledger
- [ ] **Promotions** — percentage / fixed-amount / free-item discounts
- [ ] **Loyalty** — points earning, redemption and consent tracking (LGPD)

---

## License

Academic project — all rights reserved.
