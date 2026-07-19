# Frontend brief: Users listing + Business Unit editing

Audience: the frontend agent building the admin screens. Everything below is
already implemented and green on `development`. Base URL is `/api`.

---

## 0. Conventions that apply to every endpoint here

**Auth.** Every route below requires `Authorization: Bearer <accessToken>`.
There is no cookie fallback for these. The access token carries `role` and
`businessUnitIds[]` claims; the backend re-derives scope from the token and
ignores anything the client says about it.

**Error envelope.** All failures share one shape:

```json
{
  "statusCode": 404,
  "message": "Business unit not found.",
  "error": "Not Found",
  "timestamp": "2026-07-19T10:30:00.000Z",
  "path": "/api/business-units/550e8400-..."
}
```

There is **no machine-readable error code field** — only `statusCode` and a
human `message`. Branch on `statusCode`; do not string-match `message`, it is
not a stable contract.

Status meanings across the API: `401` bad/expired token, `403` role not
allowed, `404` not found **or deliberately masked as not-found** (see the IDOR
note in §1.3), `409` uniqueness conflict, `422` payload violated a domain rule,
`400` DTO validation failed (class-validator; `message` is a joined list of
field errors).

**Pagination envelope.** Every list endpoint returns:

```json
{
  "data": [ /* items */ ],
  "meta": { "limit": 20, "nextCursor": "550e8400-...", "hasMore": true }
}
```

Cursor pagination, not offset. To load the next page, pass
`?cursor=<meta.nextCursor>`. When `hasMore` is `false`, `nextCursor` is `null` —
stop. Never build a page-number UI on top of this; use "Load more" or infinite
scroll. `limit` defaults to 20 and is capped at 100 server-side.

---

## 1. Users

### 1.0 `GET /api/users` — list users

**Roles:** `ADMIN`, `MANAGER`.

### 1.1 What changed

A `role` query filter was added. Previously the listing could only be narrowed
by unit, username and email — and since CUSTOMERs carry **zero business-unit
links**, they were unreachable for any unit-filtered query. With `?role=CUSTOMER`
an ADMIN can now list the customer base.

### 1.2 Query parameters

| Param            | Type            | Notes |
| ---------------- | --------------- | ----- |
| `limit`          | int             | default 20, max 100 |
| `cursor`         | uuid            | from `meta.nextCursor` |
| `businessUnitId` | uuid            | ADMIN: any unit. MANAGER: must be one of their own (see 1.3). |
| `username`       | string ≤50      | case-insensitive **substring** match |
| `email`          | string ≤120     | case-insensitive **substring** match |
| `role`           | enum            | **new.** `ADMIN` \| `MANAGER` \| `ATTENDANT` \| `KITCHEN` \| `CUSTOMER` |

All filters are AND-combined. An unknown `role` value is a `400`.

### 1.3 Scope rules — read this before building the UI

The `role` filter is a plain AND filter. **It is not a scope widener.**

- **ADMIN, no `businessUnitId`** → no unit restriction at all. `?role=CUSTOMER`
  returns the customer base. This is the only combination that reaches customers.
- **ADMIN, with `businessUnitId`** → restricted to that unit. Combined with
  `role=CUSTOMER` this returns an **empty page**, because customers have no unit
  links. That is correct behaviour, not a bug.
- **MANAGER** → always pinned to their own `businessUnitIds` claim, whatever the
  query says. `?role=CUSTOMER` therefore always yields an empty page for a
  MANAGER. Reaching customers is effectively an ADMIN-only read.
- **MANAGER requesting a `businessUnitId` outside their claim** → `404`, *not*
  `403`. This is deliberate anti-IDOR masking: a manager must not be able to
  probe which units exist. Render it as a generic "not found", never as
  "you don't have permission to view unit X" — that would leak exactly what the
  404 is hiding.

**UI implication.** If you build a role dropdown, either hide the `CUSTOMER`
option for MANAGERs, or show it and let the empty state speak. Do **not** show
"no results — try widening your filters", because a MANAGER cannot widen past
their claim. Prefer a neutral empty state.

### 1.4 Response item

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "joao.atendente",
  "name": "Joao Atendente",
  "email": "joao@example.com",
  "phone": "+5581988888888",
  "role": "ATTENDANT",
  "businessUnitIds": ["550e8400-..."],
  "isActive": true
}
```

`email` and `phone` are nullable. `businessUnitIds` is `[]` for unit-unbound
users (all CUSTOMERs, and ADMINs). The password hash is never present.

Ordering is `createdAt desc, id desc` — newest first, stable under pagination.

### 1.5 Examples

```
GET /api/users?role=CUSTOMER&limit=50
GET /api/users?role=ATTENDANT&businessUnitId=550e8400-...
GET /api/users?username=joao&role=MANAGER
GET /api/users?role=CUSTOMER&cursor=550e8400-...      # next page
```

### 1.6 `GET /api/users/lookup` — resolve one customer to bind to an order

**Roles:** `ADMIN`, `MANAGER`, `ATTENDANT`. `KITCHEN` and `CUSTOMER` get `403`.

This is the counter flow: an attendant taking a `COUNTER`/`PICKUP` order asks the
customer for their phone or email, resolves it here, and sends the returned `id`
as `customerId` on `POST /api/orders`.

| Param   | Type        | Notes |
| ------- | ----------- | ----- |
| `phone` | string ≤20  | **exact** match |
| `email` | string ≤120 | **exact** match, normalized (trimmed/lowercased) |

Send **exactly one** of them. Neither or both is a `400`.

Response `200`:

```json
{ "id": "550e8400-e29b-41d4-a716-446655440000", "name": "Maria Silva" }
```

That is the whole body — no email, phone, role or unit scope comes back. The
caller already knows the value they searched by.

`404` when nothing matches. A contact value belonging to a **staff account** or
to a **deactivated** one returns the same `404` as one that does not exist at
all. Deliberate: it must not be possible to probe whether a phone belongs to a
manager. Never render "this user is not a customer" — you cannot tell the cases
apart, and neither should the UI.

Rate-limited to **10 requests/min** per caller, stricter than the global limit,
because each hit/miss still answers "is this phone registered?" one guess at a
time. Do **not** wire this to an on-keystroke autocomplete — you will burn the
budget and get `429`. Search on explicit submit only.

**Exact match, by design.** There is no substring search over customers and
there will not be one: a partial-match endpoint on a staff token is a
customer-base scraper. If the attendant does not have the exact phone or email,
there is no lookup path — take the order as a guest with `customerName`.

---

## 2. Business Unit editing — already shipped, nothing to build backend-side

These four routes exist today. This section is the contract to build the UI
against.

### 2.1 `PATCH /api/business-units/:id` — edit a unit

**Role:** `ADMIN` only. A MANAGER gets `403`.

Body — **partial**, every field optional, but **at least one must be present**
(an empty `{}` is a `400`):

```json
{
  "name": "Raízes Pelourinho",
  "address": "Largo do Pelourinho, 10",
  "city": "Salvador",
  "phone": "7132223344"
}
```

| Field     | Rule |
| --------- | ---- |
| `name`    | non-empty string, ≤120 |
| `address` | non-empty string, ≤255 |
| `city`    | non-empty string, ≤120 |
| `phone`   | non-empty string, ≤20, **globally unique** |

**Not editable here, by design:**

- `cnpj` — immutable fiscal identity. Render it read-only. Sending it is stripped
  by the whitelist and silently ignored, so a form that posts it will appear to
  "work" while doing nothing — omit it from the payload.
- `isActive` — has its own routes (§2.2). Do not try to toggle it through PATCH.

**Explicit `null` is rejected with `400`.** Do not send `{"phone": null}` to mean
"clear it"; omit the key instead. This is a deliberate choice so a null cannot
reach the DB as a 500.

Responses: `200` updated unit · `400` validation · `403` not ADMIN ·
`404` unit not found · `409` phone already belongs to another unit.

> **Concurrency caveat worth surfacing in the UI:** this is read-modify-write
> with **no optimistic locking**. Two admins editing the same unit is
> last-write-wins, silently. If the product cares, refetch after save and render
> the server's response rather than trusting local form state.

### 2.2 Activate / deactivate

```
PATCH /api/business-units/:id/activate
PATCH /api/business-units/:id/deactivate
```

**Role:** `ADMIN`. No body. Returns the updated unit (`200`), or `404`.

Deactivating removes the unit from every **public** listing (§2.4) but leaves it
visible in the internal ones (§2.3). Treat it as a soft archive, not a delete —
there is no delete endpoint.

### 2.3 Internal reads (full detail, includes `cnpj` and `isActive`)

```
GET /api/business-units/internal          # cursor-paginated list
GET /api/business-units/internal/:id
```

**Roles:** `ADMIN`, `MANAGER`. These are the reads to back the admin table and
the edit form. Query params on the list: `limit`, `cursor`, `search`, `city`,
`isActive` (boolean — the only place you can list inactive units).

Response item:

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

### 2.4 Public reads (no auth, active units only, no `cnpj`)

```
GET /api/business-units          # active only, always
GET /api/business-units/:id      # 404 if the unit is inactive
```

No token required. The DTO omits `cnpj`, `isActive` and timestamps. Use these
for the customer-facing store picker — **never** the `/internal` ones, and never
render `cnpj` on a customer surface.

Passing `?isActive=false` here is ignored; the public list is hard-filtered to
active. Don't build a UI affordance for it.

### 2.5 `PUT /api/users/:id/business-units` — reassign a user's units

**Role:** `ADMIN` only.

```json
{ "businessUnitIds": ["550e8400-...", "660e8400-..."] }
```

**Replace semantics, not merge.** The array you send becomes the user's complete
set of links; anything omitted is unlinked. Sending `[]` unbinds the user from
every unit. Build this as a multi-select that submits the full desired state —
never as an "add one" call.

Runs in a transaction, so it is all-or-nothing. Responses: `200` updated user
(same shape as §1.4) · `404` user not found · `422` one of the unit ids does not
exist.

> A user's unit links live in their JWT claim, which is minted at sign-in and
> refresh. **Reassigning units does not invalidate an existing token** — the
> affected user keeps their old scope until their next refresh. If the UI needs
> the change to take effect immediately, tell the user to sign out and back in.

---

## 3. Suggested screens

| Screen | Endpoints |
| ------ | --------- |
| Staff table (filter by unit / role / username) | `GET /api/users` |
| Customer table | `GET /api/users?role=CUSTOMER` (ADMIN only) |
| Unit list + archive toggle | `GET /internal`, `PATCH /:id/activate\|/deactivate` |
| Unit edit form | `GET /internal/:id` → `PATCH /:id` |
| Assign units to a user | `GET /internal` (options) → `PUT /users/:id/business-units` |
| Public store picker | `GET /api/business-units` |
| Counter: bind a walk-in order to an existing customer | `GET /api/users/lookup` → `POST /api/orders` |

## 4. Things that do not exist — don't design around them

- No offset/page-number pagination. Cursor only.
- No delete for business units. Deactivate is the archive path.
- No machine-readable error codes. `statusCode` is the contract.
- No optimistic locking on unit edits. No `version`/`ETag` to send back.
- No `role` edit endpoint for an existing user. Role is fixed at creation.
- No sort parameter on `GET /api/users`. Ordering is fixed (newest first).
- No customer **search**. `/users/lookup` is exact-match on a full phone or
  email — no substring, no autocomplete-as-you-type, no fuzzy matching.
