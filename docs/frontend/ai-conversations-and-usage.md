# AI conversations + usage reporting - frontend integration guide

Backend v3.3.0 (`feat(ai)`, commit `e40979f`). This covers what changed and how to
consume it. The membership basics (enroll, balance, revoke) are in
`ai-membership.md`; this file only covers what is new.

Three things shipped:

1. `POST /api/ai/chat` now stores conversations server-side and returns a `conversationId`.
2. Three self-scoped routes to list / read / soft-delete those conversations.
3. `GET /api/ai/memberships` - an ADMIN report of who holds a membership and how many
   tokens they burned in a window.

Everything is additive. **Nothing you have today breaks.** But see "The one thing you
must change" below, because doing nothing has a silent cost.

---

## 1. Chat now has threads

### The one thing you must change

`POST /api/ai/chat` returns a new `conversationId` field. Store it, and send it back on
the next message of the same conversation.

If you ignore it, the API still works exactly as before - but **every message opens a
brand new one-message thread**. The user gets an assistant with no memory beyond what
you pass in `history`, and their conversation list fills up with hundreds of orphan
single-turn threads. The field is optional for wire compatibility, not because
round-tripping it is optional in practice.

### Request

```jsonc
POST /api/ai/chat
{
  "conversationId": "c9e1...",   // optional; omit to start a new thread
  "message": "E o pedido 4821?", // required, 1..4000 chars
  "history": []                  // optional, legacy, see below
}
```

### Response

```jsonc
200 OK
{
  "conversationId": "c9e1...",   // NEW - persist this
  "reply": "Seu pedido #4821 esta em preparo.",
  "tokensSpent": 42,
  "balanceRemaining": 9638
}
```

### How `conversationId` and `history` interact

| You send | Server does |
| --- | --- |
| no `conversationId` | opens a new thread; uses your `history` as the seed, if provided |
| a `conversationId` | loads its own stored turns and **ignores `history` completely** |

So `history` is now only meaningful on the first message of a thread. Treat it as
legacy: prefer starting a thread with no `history` and letting the server own the
record from there. Do not try to "correct" a thread by re-sending an edited `history`
on a call that also has a `conversationId` - it will be silently discarded.

### Minimal client shape

```ts
type ChatResponse = {
  conversationId: string;
  reply: string;
  tokensSpent: number;
  balanceRemaining: number;
};

async function sendMessage(message: string, conversationId?: string) {
  const res = await api.post<ChatResponse>('/ai/chat', { message, conversationId });
  // Persist res.conversationId in whatever holds the open chat's state.
  return res;
}
```

State rule: hold `conversationId` for the lifetime of the open chat window. Clear it
when the user explicitly starts a new chat. Do not regenerate it per message, and do
not invent one client-side - the server issues it.

### Only the last 40 turns are replayed

Each call replays at most the 40 most recent stored turns to the model. This is a
deliberate cost bound, not a bug: without it, a long thread would grow the prompt (and
the per-message price) without limit, and would eventually exceed the model's context
window and fail permanently.

Practical consequence: in a very long thread the assistant will not recall the earliest
turns. If that matters for your UX, surface it - e.g. a subtle "older messages are not
part of the assistant's context" marker once a thread passes 40 turns. `GET
/api/ai/conversations/:id` still returns *every* stored turn, so the transcript the user
reads is complete even when the model's working memory is not.

### Errors

| Status | Meaning | Suggested handling |
| --- | --- | --- |
| `403` | not enrolled, revoked, or out of tokens | distinguish by message (see the caveat in `ai-membership.md`) |
| `404` | `conversationId` is unknown, deleted, or not the caller's | drop the stored id and start a fresh thread |
| `503` | provider unavailable | offer a retry; the message was not answered |

A `503` mid-exchange is not fully clean: tokens already debited for that exchange are
**not** refunded, and the user's question is already stored. On retry, send the same
`conversationId` - the thread is intact.

---

## 2. Conversation routes

All three are scoped to the caller from the JWT. There is no `:userId` param and no way
to reach another user's threads. A thread that belongs to someone else, was deleted, or
never existed all answer `404` **identically** - this is intentional, so do not use the
status to infer whether an id exists.

### `GET /api/ai/conversations`

Lists the caller's threads, most recent activity first. Cursor-paginated.

```jsonc
GET /api/ai/conversations?limit=20&cursor=eyJ0...

200 OK
{
  "data": [
    {
      "id": "c9e1...",
      "isDeleted": false,
      "createdAt": "2026-07-20T21:00:00.000Z",
      "updatedAt": "2026-07-21T09:12:00.000Z"
    }
  ],
  "meta": { "limit": 20, "nextCursor": "eyJ0...", "hasMore": true }
}
```

`limit` defaults to 20 and is clamped to 100. `cursor` is an opaque base64url token -
treat it as a black box, never parse or construct one. Pass `meta.nextCursor` back to
get the next page, and stop when `meta.hasMore` is `false`.

A malformed `cursor` returns `422`, not `400`.

> Ordering is by last activity, which **changes as the user chats**. A thread can move
> to the top of the list mid-pagination. The backend uses a keyset cursor specifically
> so this does not drop or duplicate rows, but the UX consequence remains: a list the
> user is paging through can reorder underneath them. Re-fetch page one after sending a
> message rather than trying to patch the list in place.

### `GET /api/ai/conversations/:conversationId`

Full transcript, oldest turn first. Not capped - returns every stored turn.

```jsonc
200 OK
{
  "id": "c9e1...",
  "isDeleted": false,
  "createdAt": "...",
  "updatedAt": "...",
  "messages": [
    { "id": "m1a2...", "role": "USER",  "content": "Qual o status do pedido 4821?", "createdAt": "..." },
    { "id": "m3b4...", "role": "MODEL", "content": "Seu pedido #4821 esta em preparo.", "createdAt": "..." }
  ]
}
```

> **Role casing trap.** Stored messages use `"USER"` / `"MODEL"` (uppercase). The
> `history` field on the chat request uses `"user"` / `"model"` (lowercase). They are
> not interchangeable. If you ever map a stored transcript into a `history` payload,
> lowercase it first - though per section 1 you should be sending `conversationId`
> instead and not building `history` at all.

### `DELETE /api/ai/conversations/:conversationId`

Soft delete. The row is retained with a deletion timestamp; the API exposes that only as
the `isDeleted` boolean.

```jsonc
200 OK
{ "id": "c9e1...", "isDeleted": true, "createdAt": "...", "updatedAt": "..." }
```

Notes that matter:

- **It is idempotent.** Deleting an already-deleted thread returns `200` with the same
  row, not `404`. You do not need to guard against a double-click or a retry.
- It returns `200` with a body, not `204`.
- A deleted thread disappears from both read routes and **can no longer be continued** -
  sending its `conversationId` to `/ai/chat` returns `404`. If the user deletes the
  thread they currently have open, clear the stored id.
- **Deleting does not reduce reported token spend.** Spend lives in a separate ledger
  keyed by user. Do not present delete as a way to clear usage - it is not, and telling
  a user otherwise would be wrong.

There is no undelete endpoint.

---

## 3. Admin usage report

`GET /api/ai/memberships` - **ADMIN only** (403 otherwise). Everything else in this doc
is any authenticated user; this one is not.

```jsonc
GET /api/ai/memberships?from=2026-06-01T00:00:00Z&to=2026-07-01T00:00:00Z&limit=20

200 OK
{
  "periodFrom": "2026-06-01T00:00:00.000Z",
  "periodTo": "2026-07-01T00:00:00.000Z",
  "data": [
    {
      "id": "a1c4...",
      "userId": "f3b7...",
      "userName": "Davi Silva",
      "userEmail": "davi@example.com",
      "tokenBalance": 9680,
      "tokensUsedInPeriod": 320,
      "isRevoked": false,
      "revokedAt": null,
      "createdAt": "2026-07-14T12:00:00.000Z"
    }
  ],
  "meta": { "limit": 20, "nextCursor": "eyJ0...", "hasMore": true }
}
```

- `from` / `to` are optional ISO instants, both inclusive. Omit both for the **last 30
  days**. `periodFrom` / `periodTo` echo the window actually applied - render those
  rather than your own local assumption, so the header always matches the numbers.
- `from` after `to` -> `422`. Validate in the date picker before sending.
- `limit` / `cursor` behave exactly as in section 2.
- `userName` / `userEmail` are `null` when the user record no longer resolves. Render a
  placeholder; do not assume non-null.
- `tokenBalance` is the balance **right now**; `tokensUsedInPeriod` is spend **inside the
  window**. They are independent - an admin top-up mid-window means these two will not
  reconcile against each other. Label them distinctly in the UI or it will look like a bug.
- Revoked members still appear, with `isRevoked: true`. Revoking does not hide past spend.

This response contains **user emails**. It is the only AI endpoint that exposes them, it
is ADMIN-gated for that reason, and the assistant itself has no access to them. Keep it
out of any view a non-admin can reach, and out of client-side logs or analytics payloads.

---

## Suggested build order

1. Round-trip `conversationId` in the existing chat view. Smallest change, and it is the
   one that makes everything else meaningful.
2. Conversation list + open-a-thread, using the transcript route to rehydrate.
3. Delete, with an "are you sure" - there is no undo.
4. Admin usage report, behind the existing ADMIN route guard.

## Checklist

- [ ] `conversationId` persisted and sent back on every follow-up message
- [ ] stored id cleared on `404` from `/ai/chat`, and when the open thread is deleted
- [ ] cursors treated as opaque; paging driven by `meta.nextCursor` / `meta.hasMore`
- [ ] `422` handled on malformed cursor and on inverted `from`/`to`
- [ ] uppercase `USER`/`MODEL` not fed straight back into `history`
- [ ] delete is not described to the user as clearing token usage
- [ ] usage report gated to ADMIN, emails kept out of logs
