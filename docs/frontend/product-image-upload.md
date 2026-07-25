# Frontend brief: product image upload

Audience: the frontend agent building the product/catalog back-office and any
screen that renders a product card. Base URL is `/api`.

---

## 0. TL;DR

Two things landed:

1. **`imageUrl` is now `string | null`.** This is a **breaking read change** - a
   product can exist with no image at all. Anything doing `product.imageUrl.foo`
   or feeding it straight into `<img src>` needs a guard.
2. **A two-step upload flow** replaces "paste a URL". The image bytes go straight
   from the browser to storage; they never pass through our API.

```diff
  {
    "id": "cebe6acf-...",
    "name": "Açaí Fitness",
    "price": "20.50",
-   "imageUrl": "https://example.com/images/acai-fitness.jpg"
+   "imageUrl": null
  }
```

The API deliberately does **not** substitute a placeholder image. Rendering a
fallback is a presentation decision and it is yours.

---

## 1. The breaking change

`imageUrl` is nullable on both product-shaped payloads:

| Endpoint | DTO |
| -------- | --- |
| `GET /api/products`, `GET /api/products/:id`, `GET /api/products/by-business-unit/:id`, `POST /api/products`, `PATCH /api/products/:id` | `ProductResponseDto.imageUrl` |
| `GET /api/business-units/:id/menu-items` (public menu) | `PublicMenuItemResponseDto.imageUrl` |

The key is always present, so `"imageUrl" in product` stays true - only the value
can be `null`.

`imageUrl` on `POST /api/products` is now **optional**. Create the product first,
upload the image afterwards.

---

## 2. The upload flow

Three calls. Only steps 1 and 3 hit our API.

```
  1. POST /api/products/:productId/image/upload-url   ->  { signedUrl, token, path, expiresInSeconds }
  2. PUT the file to the storage (no auth header of ours)
  3. POST /api/products/:productId/image/confirm      ->  the updated product, with imageUrl set
```

Both API calls require an **ADMIN or MANAGER** access token.

### Step 1 - mint

```http
POST /api/products/550e8400-e29b-41d4-a716-446655440000/image/upload-url
Authorization: Bearer <access token>
Content-Type: application/json

{ "contentType": "image/jpeg" }
```

`contentType` must be one of `image/png`, `image/jpeg`, `image/webp`. Anything
else is a `400` from the validation pipe.

```json
{
  "signedUrl": "https://<project>.supabase.co/storage/v1/object/upload/sign/product-images/products/550e.../f81d....jpg?token=...",
  "token": "eyJhbGciOi...",
  "path": "products/550e8400-e29b-41d4-a716-446655440000/f81d4fae-7dec-41d0-a765-00a0c91e6bf6.jpg",
  "expiresInSeconds": 7200
}
```

Nothing is persisted by this call. Minting a URL and walking away changes nothing
on the product.

Rate limit: **10 mints per minute** per client. Each one is a live write
credential for the bucket, so do not mint on every keystroke - mint when the user
actually picks a file.

### Step 2 - upload

With the Supabase JS client (recommended - it sets the headers for you):

```ts
import { createClient } from '@supabase/supabase-js';

// Publishable/anon key only. The server key never reaches the browser.
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const { error } = await supabase.storage
  .from('product-images')
  .uploadToSignedUrl(path, token, file);
```

Or plain `fetch`, which needs no key at all - the credential is in the URL:

```ts
await fetch(signedUrl, {
  method: 'PUT',
  headers: { 'Content-Type': file.type },
  body: file,
});
```

Send the real file `Content-Type`. The server checks what the bucket **actually**
stored, not what you claimed at step 1, so a mismatch is caught at step 3.

### Step 3 - confirm

```http
POST /api/products/550e8400-e29b-41d4-a716-446655440000/image/confirm
Authorization: Bearer <access token>
Content-Type: application/json

{ "path": "products/550e8400-.../f81d4fae-....jpg" }
```

Echo `path` back **verbatim** from step 1. Do not build it yourself: the server
re-parses it against this product and rejects anything that does not match.

The response is the full updated product, with `imageUrl` already pointing at the
permanent public CDN URL. Use that response directly - no refetch needed.

Confirm also deletes the image it replaced, so old files do not pile up.

---

## 3. Errors

| Status | When | What to do |
| ------ | ---- | ---------- |
| `400` | `contentType` outside the allowlist, or `path` missing/over 300 chars | Fix the request. |
| `401` | No/expired access token | Refresh, retry. |
| `403` | Token is not ADMIN or MANAGER | Hide the control for other roles. |
| `404` (mint) | No such product | Reload the product list. |
| `404` (confirm) | No object at that path: the upload never happened, or the token expired mid-upload | **Restart from step 1** and upload again. |
| `422` (confirm) | The path is not this product's, or the stored file is empty, too large, or not an allowed type | Show a validation message. Re-picking the file is the fix. |
| `429` | More than 10 mints in a minute | Back off. |
| `503` | Storage provider is unreachable | Retry with backoff; nothing was persisted. |

### Expiry

`expiresInSeconds` is **7200** (2 hours), fixed by the provider - it is not
configurable per request. In practice a token only expires if the user leaves a
half-finished form open. If the upload fails with an auth/expiry error from
storage, or confirm answers `404`, throw the mint away and start again at step 1;
there is nothing to clean up on our side.

---

## 4. Replacing and clearing

- **Replace:** run the same three steps again. Each mint produces a brand new
  random object name, so the new image gets a new URL and never fights a CDN
  cache of the old one. The previous object is deleted on confirm.
- **Clear:** `PATCH /api/products/:productId` with `{ "imageUrl": null }`. That
  route still accepts a free-text URL too, so an externally hosted image remains
  possible. Note it only clears the reference - it does not delete the stored
  object.
  **Roles differ here:** `PATCH /api/products/:productId` is **ADMIN-only**,
  while both image routes are ADMIN + MANAGER. A MANAGER who can replace an
  image gets `403` when trying to clear one, so hide the clear action for that
  role instead of letting it fail.

---

## 5. What not to do

- Do not cache `imageUrl` across a replace: the URL changes every time.
- Do not construct `path` yourself, and do not put a user-supplied file name in
  it. The server owns the path shape and will reject anything else with `422`.
- Do not call confirm before the upload has finished. It will `404`.
