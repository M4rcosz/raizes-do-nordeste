# Frontend brief: `productName` on order items

Audience: the frontend agent rendering orders (history, receipts, kitchen/counter
screens, order confirmation). Shipped in **4.1.0** on `development`, green on
1776 unit + 97 e2e tests. Base URL is `/api`.

---

## 0. TL;DR

Every order item now carries `productName`. **Use it. Do not look the name up
from the catalog.**

```diff
  "orderItems": [
    {
      "id": "2f9b...",
      "productId": "b2d8...",
+     "productName": "Baiao de Dois",
      "quantity": 2,
      "unitPrice": "12.50",
      "subtotal": "25.00",
      "notes": null
    }
  ]
```

This is **additive and non-breaking**. Nothing was removed or retyped, so if you
do nothing, existing screens keep working exactly as they do today. The work
below is about deleting code, not adding it.

---

## 1. Why this exists (read this before you write the code)

`productName` is a **snapshot**, not a join. It stores what the product was
called *at the moment the order was placed*, and it never changes afterwards.

This matters because the alternative — what a frontend naturally does — is
broken:

```ts
// WRONG. Do not do this, and delete it if it already exists.
const product = await fetchProduct(item.productId);
render(product.name);
```

That renders the product's **current** name. Rename "Baiao de Dois" to "Baiao de
Dois Tradicional" and every historical order retroactively claims the customer
bought something they never ordered. Deactivate or retire the product and the
lookup returns nothing at all, so an old order renders a blank line or a
spinner that never resolves.

The backend already made this decision for you: `unitPrice` has always been
snapshotted for the same reason. A receipt line's name and price have to stay
mutually consistent forever, and the name was the missing half.

> **The rule, in one line:** the commercial record is copied, a living person's
> identity is joined.

### The corollary you must not get wrong

`customerName` on the order goes the **opposite** way. When the order belongs to
an account, it is joined live from the user record on every read and is never
stored. A person's current name is owned by their account — copying it would
create a second, silently diverging record of personal data that an LGPD
rectification or erasure request would have to chase separately.

So:

| Field                   | Behaviour   | What you do                                                        |
| ----------------------- | ----------- | ------------------------------------------------------------------ |
| `orderItems[].productName` | **Snapshot** | Safe to cache with the order. Never refetch it.                    |
| `order.customerName`    | **Live join** | Do **not** cache it across sessions. Re-read it with the order.   |

If you persist orders in local storage or a client-side cache, `customerName`
can be stale after a profile edit; `productName` cannot be, by construction.

---

## 2. Where it appears

Every order read path, all returning the same `orderItems[]` shape:

| Endpoint                        | Auth                | Notes                                              |
| ------------------------------- | ------------------- | -------------------------------------------------- |
| `POST /api/orders`              | authenticated       | The `201` response body already includes it.       |
| `GET /api/orders/me`            | `CUSTOMER`          | Customer's own history. `customerId` is forced from the JWT — you cannot and need not pass it. |
| `GET /api/orders`               | staff roles         | Back-office listing, unit-scoped.                  |
| `GET /api/orders/:id`           | authenticated       | Customers may only read their own.                 |

There is no new endpoint, no new query parameter, and no version bump on the
route. If you already render orders from any of these, the field is simply
present now.

---

## 3. What to change

### 3.1 Types

```ts
interface OrderItem {
  id: string;
  productId: string;
  productName: string; // NEW - always present, never null
  quantity: number;
  unitPrice: string;   // decimal string, not a number
  subtotal: string;    // decimal string, not a number
  notes: string | null;
}
```

`productName` is **non-nullable**. The column is `NOT NULL` in the database and
the value is resolved server-side at creation from the authoritative menu read,
so there is no "missing name" branch to handle. Do not write
`item.productName ?? 'Unknown'` — a fallback there is dead code that will hide a
real bug if one ever appears.

### 3.2 Delete the catalog round-trip

Anywhere an order screen currently fetches products to resolve names — an
effect, a `Promise.all` over `productId`s, a products-by-id map built just for
this, a loading state for it — delete it. That is usually an N+1 on the client
and it is now both slower and *wrong*.

Keep catalog fetches that serve a different purpose (product image, description,
current price on a re-order button). Only the **name resolution for a historical
line** is obsolete.

### 3.3 Re-order flows: be careful here

If you have a "buy this again" button, note the two names are legitimately
different things:

- Show `item.productName` when describing **what they ordered** (history, receipt).
- Fetch the **current** menu when building the **new** order — current name,
  current price, current availability. The old snapshot must not seed a new cart.

A product that was renamed, retired, or removed from that unit's menu will be
rejected at order creation (`404` off-menu, `422` inactive/unavailable). Handle
that rather than assuming a past order is re-orderable.

### 3.4 Money is still a string

Unrelated to this change but the most common mistake on this endpoint:
`unitPrice` and `subtotal` are **decimal strings**, never numbers. Do not
`parseFloat` them for arithmetic. Format for display, and if you must compute,
use a decimal library.

---

## 4. What you cannot do

`productName` is **server-owned**. It is not part of the order creation request
body and never will be:

```jsonc
// POST /api/orders - correct
{
  "businessUnitId": "...",
  "orderChannel": "APP",
  "orderItems": [
    { "productId": "b2d8...", "quantity": 2, "unitPrice": "12.50" }
  ]
}
```

Sending `productName` inside an order item returns **`400`**, not a silent
ignore — the API rejects unknown fields rather than dropping them. The server
resolves the name from the same authoritative menu read that validates the line,
so the stored name can never disagree with the product actually ordered.

Same applies to `subtotal`: server-computed, never sent.

---

## 5. Existing orders

The migration backfilled every pre-existing order line from the product it
references, so historical orders have real names, not placeholders or empty
strings. There is no "orders created before 4.1.0" case to special-case.

One honest caveat: for orders placed *before* this shipped, the backfill copied
the product's name **as of the migration**, not as of the original order date.
If a product was renamed between an old order and the migration, that old order
now shows the post-rename name. That history was already unrecoverable — the old
name was never stored anywhere. Everything from 4.1.0 onward is a true
point-of-sale snapshot.

---

## 6. AI assistant surface

If you surface the in-app assistant, its order tool view now returns
`productName` alongside `productId`, so it can say "your Baiao de Dois" instead
of reciting a UUID. No frontend change needed — noted so you know the assistant
and the order screen will now agree on wording.
