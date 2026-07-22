# Pagination cursors are now opaque tokens — frontend migration

**Status:** BREAKING. Backend change is merged on `development`.
**Audience:** whoever (human or Claude) works on the frontend that consumes this API.
**TL;DR:** if your code ever builds a cursor out of a row id, it now returns `422`. If it
only ever passes `meta.nextCursor` back verbatim, you have nothing to change.

---

## 1. What changed on the backend, and why

Every paginated listing used to page with Prisma's **positional row cursor**
(`cursor: { id } + skip: 1`). That resolves a *position* inside the filtered result set.
If the row the cursor names stops matching the filter between two page requests — a
product is deactivated, an order changes status, a promotion expires — the position
shifts one row along and `skip: 1` swallows the row that should have been first on page 2.

This was not theoretical. Measured against the real database, twice:

```
5 menu items, page 1 = 3 rows. Deactivate the row the cursor names. Request page 2:
  POSITIONAL cursor -> 1 row   (one item silently vanished from the menu)
  KEYSET predicate  -> 2 rows  (correct)
```

No error, no warning — the list just came back short. All listings were migrated to a
**keyset** predicate, which compares sort *values* instead of locating a row. The
consequence for you: the cursor can no longer be a row id, because the server needs the
row's sort key too. It is now an opaque token.

---

## 2. The cursor's new shape

```
before:  550e8400-e29b-41d4-a716-446655440000
         36 chars, an actual row id you could read and construct

after:   eyJ0aW1lc3RhbXAiOiIyMDI2LTA3LTIyVDE5OjU3OjE0LjEyM1oiLCJpZCI6IjU1MGU4NDAwLi4u
         ~112 chars, base64url, opaque
```

Properties worth knowing:

- **Charset is `[A-Za-z0-9_-]`, no `=` padding.** It is URL-safe as-is.
  `encodeURIComponent` is harmless but not required.
- **~112 characters**, vs 36 before. Only matters if you keep cursors in the URL bar.
- **It is not signed and not secret** — it is a position, never an authorization input.
  The server re-applies your unit/ownership scope independently on every request, so a
  tampered token cannot widen what you can see. It can only produce a nonsense position
  or a `422`.
- **Treat it as a black box.** Do not parse it, do not read the id out of it, do not
  build one. Its internal shape is not a contract and has already changed once.

---

## 3. What to change

### 3.1 Stop constructing cursors — the one hard break

```ts
// BROKEN — 422 on page 2
const next = await api.get(`/api/products?cursor=${items.at(-1).id}`);

// CORRECT
const next = await api.get(`/api/products?cursor=${page.meta.nextCursor}`);
```

Search the frontend for these patterns:

```bash
rg 'cursor=\$\{'                 # template-built cursors
rg 'cursor.*\.id\b'              # cursor taken from a row
rg 'at\(-1\)|\[.*length - 1\]'   # "last item" logic feeding pagination
```

### 3.2 Drop any UUID typing or validation on the cursor

```ts
// BROKEN — rejects the token before it is ever sent
const Query = z.object({ cursor: z.string().uuid().optional() });
type Params = { cursor?: UUID };

// CORRECT
const Query = z.object({ cursor: z.string().max(512).optional() });
type Params = { cursor?: string };
```

```bash
rg -i 'cursor' --glob '*schema*' --glob '*types*' --glob '*dto*'
```

The server caps the cursor at **512 characters**; anything longer is a `400`.

### 3.3 Handle `422` by resetting to page 1

A malformed, stale, or cross-listing token is `422 Unprocessable Entity`. This is
deliberate — silently restarting server-side would make a client page forever without
ever noticing.

```ts
try {
  page = await fetchPage(cursor);
} catch (err) {
  if (err.status === 422) {
    // Stale or malformed cursor: drop it and restart the listing.
    clearStoredCursor();
    page = await fetchPage(undefined);
  } else {
    throw err;
  }
}
```

### 3.4 Do not persist cursors across a deploy

Any cursor stored in `localStorage`, a bookmarked URL, or a shared link from before this
change is now invalid and will `422`. If you persist cursors, clear that storage on
version change, or rely on 3.3 to recover.

Cursors were never meant to outlive a browsing session — they encode a position in a
result set that is still changing underneath you.

### 3.5 Never build a page-number UI on this

Unchanged from before, restating because it now matters more: keyset pagination is
forward-only. There is no page count, no "jump to page 7", no going backwards. Use
**"Load more"** or infinite scroll. Stop when `meta.hasMore === false` (at which point
`meta.nextCursor` is `null`).

---

## 4. Which endpoints are affected

The response envelope is unchanged everywhere:

```jsonc
{ "data": [...], "meta": { "limit": 20, "nextCursor": "eyJ0…" | null, "hasMore": true } }
```

### Cursor changed from a row id to a token — **audit these**

| Endpoint | Notes |
| --- | --- |
| `GET /api/products` | public |
| `GET /api/products/by-business-unit/:businessUnitId` | public |
| `GET /api/business-units` | public |
| `GET /api/business-units/internal` | ADMIN / MANAGER |
| `GET /api/business-units/:businessUnitId/menu` | public |
| `GET /api/business-units/:businessUnitId/menu/manage` | ADMIN / MANAGER |
| `GET /api/categories` | public |
| `GET /api/users` | ADMIN / MANAGER |
| `GET /api/audit-logs` | ADMIN |
| `GET /api/inventory/:businessUnitId` | unit-scoped |
| `GET /api/promotions/by-business-unit/:businessUnitId` | ADMIN / MANAGER |
| `GET /api/orders/me` | CUSTOMER |

### Already a token, but the payload changed — **old cursors now `422`**

| Endpoint | Notes |
| --- | --- |
| `GET /api/orders` | staff; cursor is also bound to the `sortBy`/`sortDir` it was issued under (see 5) |
| `GET /api/promotions/public/by-business-unit/:businessUnitId` | public |

### Genuinely unchanged — no action

| Endpoint | Notes |
| --- | --- |
| `GET /api/ai/conversations` | already used this exact token shape |
| `GET /api/ai/memberships` | already used this exact token shape |

---

## 5. `GET /api/orders` only: the cursor is bound to its sort

`GET /api/orders` accepts `sortBy` (`createdAt` \| `totalAmount`) and `sortDir`
(`asc` \| `desc`). The cursor records which sort it was minted under.

**If the user changes the sort, you must drop the cursor and start from page 1.**
Replaying a cursor under a different sort is `422` with
`"Pagination cursor does not match the requested sort."` — not a generic invalid-cursor
message, so you can tell the two apart if you want a friendlier reset.

```ts
function onSortChange(next: Sort) {
  setSort(next);
  setCursor(undefined); // required — the old cursor describes a position in the old order
}
```

This is a rejection rather than a silent restart on purpose: silently re-serving page 1
under the new sort would look to the user like the sort worked when it half-didn't.

---

## 6. Verification checklist

- [ ] No cursor is constructed anywhere; every one comes from `meta.nextCursor`
- [ ] No UUID type/validator/schema is applied to a cursor field
- [ ] `422` on a listing clears the cursor and refetches page 1
- [ ] Persisted cursors (localStorage / URL) are cleared on app version change
- [ ] Changing sort on the orders list resets the cursor
- [ ] Paging stops on `hasMore === false`, not on an empty `data` array
- [ ] Manual test per listing: load page 1, load page 2, confirm **no duplicate and no
      missing row** across the boundary
- [ ] Manual test: start paging, have someone deactivate a product/promotion mid-flow,
      confirm the next page is still complete — this is the bug the whole change exists
      to fix

---

## 7. Related docs to read alongside this

- `docs/frontend-public-promotions.md` — already documents the opaque-token contract
  correctly; good reference wording.
- `docs/frontend/ai-conversations-and-usage.md` — same, plus a worked paging example.
- `docs/frontend-users-and-business-units.md` — **currently out of date.** It still
  documents `cursor` as a `uuid` and shows `?cursor=550e8400-...`, which is exactly the
  broken pattern. Ignore its cursor guidance until it is corrected; everything else in it
  still holds.
