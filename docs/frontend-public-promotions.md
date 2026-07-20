# Frontend brief: public promotions listing

Audience: the frontend agent building the customer-facing promotions display.
Everything below is implemented and green on `development`. Base URL is `/api`.

---

## 0. Why this endpoint exists

There was no customer-facing promotions endpoint before this change. The only
listing was `GET /api/promotions/by-business-unit/:businessUnitId`, which is a
**back-office** route: it is gated to `ADMIN`/`MANAGER`, it is unit-scoped, and
it returns every promotion of the unit — including inactive drafts, expired
ones and ones that have not started yet.

That is why a `CUSTOMER` token got a `403`/`404` there. It was not a bug to
loosen; showing a customer a draft or an expired offer would be the bug.

So the fix is a second, separate route with a narrower filter and a narrower
response shape. **The back-office route is unchanged** — if you are building an
admin screen, keep using it exactly as before.

---

## 1. The endpoint

```http
GET /api/promotions/public/by-business-unit/:businessUnitId
```

**Auth: none.** This route is `@Public()`. Do not send `Authorization`; it is
ignored if you do. An anonymous visitor browsing the site sees the same offers a
logged-in customer sees.

**What it returns:** only promotions where `isActive === true` **and** the
current server instant falls inside `[startDate, endDate)`. The window's right
edge is half-open — `endDate` is the first instant the promotion is *no longer*
valid, not the last instant it is valid. Filtering happens in SQL, so a page is
never short because expired rows were dropped after the page was cut.

### Path params

| Param            | Type      | Notes                          |
| ---------------- | --------- | ------------------------------ |
| `businessUnitId` | uuid      | Rejected with `400` if not a uuid |

### Query params

| Param    | Type   | Default | Notes                                              |
| -------- | ------ | ------- | -------------------------------------------------- |
| `limit`  | int    | `20`    | Clamped server-side to `1..100`. `?limit=99999` silently becomes `100` — do not rely on the server echoing your value. |
| `cursor` | string | —       | The `meta.nextCursor` from the previous page. Genuinely opaque (a base64url token, not a promotion id) — pass it back verbatim, never construct, parse or hand-edit it. A malformed token is `422`. |

### Response `200`

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "businessUnitId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "name": "Almoço executivo",
      "discountType": "PERCENTAGE",
      "discountValue": "10.00",
      "minOrderValue": "30.00",
      "endDate": "2026-06-30T23:59:59.000Z"
    }
  ],
  "meta": {
    "limit": 20,
    "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA1LTE4VDEwOjMwOjAwLjAwMFoiLCJpZCI6IjU1MGU4NDAwLWUyOWItNDFkNC1hNzE2LTQ0NjY1NTQ0MDAwMCJ9",
    "hasMore": true
  }
}
```

Fields deliberately **absent** vs. the admin shape: `isActive` (always true
here, by construction), `startDate` (already in the past for every row
returned), `createdAt`, `updatedAt`. Do not build UI that needs them — asking
for them on a public route is a leak, not a feature request.

An empty result is `200` with `"data": []`, **not** `404`. A `businessUnitId`
that does not exist also returns an empty list rather than `404`: a public route
should not confirm which unit ids exist.

---

## 2. Rendering the discount

`discountType` has three values in the schema, but only two are usable:

| `discountType`  | Meaning                                          | Render as      |
| --------------- | ------------------------------------------------ | -------------- |
| `PERCENTAGE`    | `discountValue` is a percentage off the subtotal  | `10% OFF`      |
| `FIXED_AMOUNT`  | `discountValue` is an absolute amount in BRL      | `R$ 10,00 OFF` |
| `FREE_ITEM`     | **Not implemented.** See the warning below.       | skip the row   |

> **`FREE_ITEM`.** It can never be priced (the schema does not model which item is
> free), so the backend now rejects it with `422` at both write borders — creating
> a `FREE_ITEM` promotion and patching an existing one into it. **New rows are
> impossible.**
>
> Rows created before that check landed can still exist in an older database, so
> **defensively skip any row whose `discountType` is not `PERCENTAGE` or
> `FIXED_AMOUNT`** rather than rendering it or crashing on an unexpected enum
> value. Cheap insurance; drop it once you know the data is clean.

`minOrderValue` is the order subtotal the customer must reach before the
promotion applies. `"0.00"` means no minimum — suppress the "minimum order"
line in that case rather than rendering `R$ 0,00`.

### Money is a string. Keep it a string.

`discountValue` and `minOrderValue` are **2-decimal-place strings**, not
numbers. This is deliberate and matches the rest of the API. `JSON.parse` will
not turn them into floats unless you ask it to — so don't.

```ts
// WRONG - reintroduces float error the backend spent effort avoiding
const off = Number(promo.discountValue) * 0.01;

// RIGHT - format for display, do not compute
new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  .format(Number(promo.minOrderValue));
```

Formatting for display is fine (the value is already rounded and final).
**Computing** an order total client-side is not: the server is authoritative for
the applied discount, and it applies at most one promotion per order. Show the
offers; let the order response tell you what was actually applied.

---

## 3. Things that will bite you

**Do not treat this as "the promotions the customer will get."** This is a
*catalog* of what is currently on offer at that unit. Eligibility (the
`minOrderValue` gate) is evaluated at order creation, and only one promotion is
applied per order. A customer seeing three offers here may receive one.

**`endDate` is half-open.** A promotion with `endDate` of `2026-06-30T23:59:59Z`
stops appearing at exactly that instant, not after it. If you render a countdown,
count down *to* `endDate`.

**The list is time-sensitive.** A row can vanish between two requests because it
expired or an admin deactivated it. Don't cache aggressively.

Paging *is* safe across that, though: the cursor is a keyset token carrying the
sort position, not a pointer to a row, so page 2 stays correct even if the last
row of page 1 expired or was deactivated in between. (An earlier build used a
positional cursor and silently dropped a row in exactly that case.) What you may
still see is a row that was on page 1 no longer existing by the time the user
acts on it — normal for any live listing.

**Rate limiting applies.** The global throttle (default **100 requests / 60s per
IP**, `THROTTLE_TTL_MS` / `THROTTLE_LIMIT`) covers public routes too — it runs
*before* auth. On a shared/corporate NAT, many users share one IP. Handle `429`
with a backoff, and don't poll this endpoint on a timer.

**Ordering** is newest-first (`createdAt DESC`, `id DESC` as tie-break). There is
no sort parameter.

---

## 4. Quick integration sketch

```ts
type PublicPromotion = {
  id: string;
  businessUnitId: string;
  name: string;
  // FREE_ITEM is in the schema but unusable - see §2. Widen the type so an
  // unexpected value is a filter, not a runtime surprise.
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_ITEM';
  discountValue: string;   // "10.00"
  minOrderValue: string;   // "30.00"
  endDate: string;         // ISO-8601
};

type Paginated<T> = {
  data: T[];
  meta: { limit: number; nextCursor: string | null; hasMore: boolean };
};

async function fetchPromotions(
  businessUnitId: string,
  cursor?: string,
): Promise<Paginated<PublicPromotion>> {
  const qs = new URLSearchParams({ limit: '20', ...(cursor && { cursor }) });
  const res = await fetch(
    `/api/promotions/public/by-business-unit/${businessUnitId}?${qs}`,
  );
  if (!res.ok) throw new Error(`promotions: ${res.status}`);
  return res.json();
}
```

No `Authorization` header. No `businessUnitId` in a body anywhere. Branch on
`res.status`, not on `message` text — see the error-envelope note in
`frontend-users-and-business-units.md` §0, which applies unchanged here.

---

## 5. Also fixed alongside this endpoint

If you build an **admin** promotions screen, note that `POST /api/promotions`,
`GET/PATCH /api/promotions/:promotionId` and the activate/deactivate routes were
returning `404` for every `MANAGER` token — only `ADMIN` could reach them. That
was a guard bug (unrelated to this endpoint) and is now fixed. If you previously
worked around it by requiring an admin login, you can drop the workaround.
