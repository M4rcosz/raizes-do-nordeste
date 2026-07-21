# AI Token Membership - Frontend Integration Guide

Handoff doc for the frontend. Describes the AI token membership API so you can build
(a) the admin management screen and (b) the user-facing chat gating. Backend is live on
this branch; every shape below is taken from the real DTOs and error mappings.

## What this feature is

Each user can hold an **AI membership**: a per-user, global (not per-business-unit) token
wallet that meters use of the support assistant chat. An admin enrolls a user with a
starting balance, tops it up or claws it back, and can **soft-revoke** access. A revoked
membership keeps its row and its balance but blocks all AI use until reinstated.

A membership is in exactly one of three states:

| State | How to detect | Meaning |
| --- | --- | --- |
| Not enrolled | `GET .../me` returns `404` | No wallet exists. Admin must enroll. |
| Active | `revokedAt === null` | Can chat and spend tokens (if balance > 0). |
| Revoked | `revokedAt !== null` | Blocked from chat and from balance changes. Balance is preserved. |

## Auth

All routes require a Bearer JWT: `Authorization: Bearer <accessToken>`.
- Management routes (enroll, adjust, revoke, reinstate) are **ADMIN only** -> a non-admin gets `403`.
- `GET .../me` and `POST /ai/chat` are for **any authenticated user** (the caller acts on themselves).

Base path is `/api`. All routes below are under it.

## Endpoints

### GET `/api/ai/memberships/me`
The caller's own membership. Use it to render the user's balance and whether they are revoked.
- `200` -> `MembershipResponse`
- `404` -> the caller has no membership yet (show an "ask an admin to enroll you" state).

### POST `/api/ai/memberships/:userId` (ADMIN) - enroll
Create a membership with a starting balance.
- `:userId` is the target user UUID.
- Body: `{ "initialBalance": number }` - integer, `0 .. 2147483647`.
- `201` -> `MembershipResponse`
- `409` -> the user already has a membership.
- `404` -> `:userId` does not match any user.

### PATCH `/api/ai/memberships/:userId/balance` (ADMIN) - top up / claw back
Apply a signed delta to the balance.
- Body: `{ "delta": number }` - non-zero integer, `-2147483647 .. 2147483647`. Positive credits, negative debits.
- `200` -> `MembershipResponse`
- `404` -> no membership for `:userId`.
- `403` -> the membership is revoked (reinstate before adjusting). See the 403 caveat below.
- `422` -> the delta is zero, would drive the balance below zero, or would overflow the ceiling.

### DELETE `/api/ai/memberships/:userId` (ADMIN) - soft revoke
Revoke access. Balance is preserved. Idempotent: revoking an already-revoked membership
returns `200` with the current (revoked) row and no error.
- `200` -> `MembershipResponse` (with `revokedAt` set).
- `404` -> no membership for `:userId`.

### POST `/api/ai/memberships/:userId/reinstate` (ADMIN) - undo a revoke
Clear the revoke. Balance and everything else are restored. Idempotent: reinstating an
active membership returns `200` with the current row and no error.
- `200` -> `MembershipResponse` (with `revokedAt === null`).
- `404` -> no membership for `:userId`.

### POST `/api/ai/chat` - the metered assistant
Any authenticated user. Enrollment, revoke, and balance are enforced here, not by a role gate.
- Body: `{ "conversationId?": uuid, "message": string (1..4000), "history?": ChatMessage[] (<= 50) }`
  where `ChatMessage = { "role": "user" | "model", "text": string }`.
  - Omit `conversationId` to start a new thread, optionally seeded with `history`.
  - Pass a prior `conversationId` to continue that thread. The server then replays its
    own stored turns and **ignores** the client's `history` entirely.
  - Only the last 40 stored turns are replayed to the model, so cost per call stays
    bounded no matter how long the thread gets.
- Rate limited to **20 requests / minute / user** (tighter than the global default).
- `200` -> `{ "conversationId": string, "reply": string, "tokensSpent": number, "balanceRemaining": number }`
  Echo `conversationId` back on the next call to keep the thread going. **If you do not,
  every message opens a new single-turn thread** - the field is optional for wire
  compatibility, not because round-tripping it is optional in practice.
- `403` -> not enrolled, revoked, or out of tokens (distinguish by message - see caveat).
- `404` -> the given `conversationId` is not the caller's, was deleted, or does not exist
  (indistinguishable on purpose).
- `503` -> the assistant provider is temporarily unavailable. Safe to offer a retry.

### GET `/api/ai/conversations` - the caller's threads
Self-scoped from the JWT; there is no `:userId` param. Last activity first,
keyset-paginated (`limit`/`cursor`, same envelope as the rest of the API).
- `200` -> `{ "data": ConversationSummary[], "meta": { "nextCursor": string | null, "hasMore": boolean } }`
- `422` -> malformed `cursor`.

### GET `/api/ai/conversations/:id` - read one thread
- `200` -> `ConversationDetail` (all stored turns, oldest first - this route is not capped).
- `404` -> not the caller's, deleted, or unknown. Do not use this to probe ids.

### DELETE `/api/ai/conversations/:id` - soft delete
Idempotent: deleting an already-deleted thread returns `200` with the same row, not `404`.
The thread then disappears from both read routes and can no longer be continued.
- `200` -> `ConversationSummary` with `isDeleted: true`.
- `404` -> not the caller's, or unknown.

Token spend the thread produced is **not** affected - it lives in a separate ledger keyed
by user, so deleting conversations never changes what the admin report shows.

### GET `/api/ai/memberships` - admin usage report
ADMIN only. Lists memberships with balance and spend over a window.
- Query: `from?`/`to?` (ISO instants, inclusive; default is the last 30 days), `limit?`, `cursor?`.
- `200` -> `{ "periodFrom", "periodTo", "data": MembershipUsage[], "meta": {...} }`
- `422` -> `from` after `to`, or a malformed `cursor`.

## Response shapes

`MembershipResponse`:
```json
{
  "id": "uuid",
  "userId": "uuid",
  "tokenBalance": 9680,
  "createdAt": "2026-07-20T21:00:00.000Z",
  "revokedAt": null
}
```
`revokedAt` is an ISO timestamp when revoked, `null` when active. It is the single source
of truth for the revoked state - do not infer it from anything else.

`ChatResponse`:
```json
{
  "conversationId": "uuid",
  "reply": "Seu pedido #4821 esta em preparo.",
  "tokensSpent": 42,
  "balanceRemaining": 9638
}
```

`ConversationSummary`:
```json
{
  "id": "uuid",
  "isDeleted": false,
  "createdAt": "2026-07-20T21:00:00.000Z",
  "updatedAt": "2026-07-21T09:12:00.000Z"
}
```
`ConversationDetail` is the same plus `"messages"`, oldest first, each
`{ "id": uuid, "role": "USER" | "MODEL", "content": string, "createdAt": ISO }`.
Note the roles are uppercase here, unlike the lowercase `"user"`/`"model"` used by the
`history` field on the chat request.

`MembershipUsage` (items of the admin report):
```json
{
  "id": "uuid",
  "userId": "uuid",
  "userName": "Davi Silva",
  "userEmail": "davi@example.com",
  "tokenBalance": 9680,
  "tokensUsedInPeriod": 320,
  "isRevoked": false,
  "revokedAt": null,
  "createdAt": "2026-07-14T12:00:00.000Z"
}
```
`userName`/`userEmail` are `null` when the user record no longer resolves.

## Errors

Every error uses the same envelope (there is **no** machine-readable error code field):
```json
{ "statusCode": 403, "error": "Forbidden", "message": "This user AI membership has been revoked." }
```

Status codes you will see: `400` (malformed body / bad UUID), `403` (forbidden - see caveat),
`404` (not found), `409` (conflict), `422` (business-rule violation), `503` (provider down).

### Caveat: 403 is overloaded
Three different situations on the chat and adjust routes all return `403`, and there is no
code field, so you must branch on the `message` string if you want distinct UI copy:
- Not enrolled -> message mentions enrollment.
- Revoked -> "This user AI membership has been revoked."
- Out of tokens (chat only) -> mentions running out of tokens.

Recommendation: for the current user, prefer reading `GET .../me` up front to know
enrolled/revoked/balance, and treat a chat `403` primarily as "out of tokens or state
changed under you - re-fetch `/me` and re-render". Do not hard-parse message text for
control flow beyond a coarse fallback; treat the message as human-facing.

## Suggested UI

**Admin - membership management (per user):**
- Show state badge from `revokedAt`/`404`: Not enrolled / Active / Revoked.
- Not enrolled -> "Enroll" with an initial-balance input.
- Active -> balance with "Add tokens" / "Remove tokens" (single signed delta field) and a "Revoke access" button (confirm dialog; note the balance is kept).
- Revoked -> a clear "Revoked on {revokedAt}" banner plus a "Reinstate" button. Hide/disable the adjust controls while revoked (the API will 403 them anyway).
- Enroll/adjust/revoke/reinstate all return the fresh `MembershipResponse` - use it to update local state without an extra GET.

**User - chat:**
- Gate the chat entry on `GET /ai/memberships/me`: not enrolled -> "no AI access" empty state; revoked -> "access revoked, contact an admin"; active -> show remaining balance.
- After each chat `200`, update the displayed balance from `balanceRemaining`; if it hits 0, switch to an "out of tokens" state.
- On `403` mid-session, re-fetch `/me` and re-render the gate. On `503`, show a transient error with retry.

## Notes / gotchas

- Revoke and reinstate are **idempotent** - safe to retry; a repeat call is a no-op that returns the current row, not an error.
- Revoke does **not** change the balance. If you also want to zero it, that is a separate `PATCH .../balance` clawback.
- The 20/min chat throttle is per user; a burst returns `429` from the global throttler.
- `tokenBalance` and `delta` are plain integers (token counts), not money - no decimals, no currency.
