# Frontend brief: conversation titles + search

Audience: the frontend agent building the AI assistant UI (chat window, thread
list/sidebar). Shipped on `development`, green on 1846 unit + 97 e2e tests. Base
URL is `/api`.

Companion to `ai-conversations-and-usage.md`, which covers threads themselves.
Read that first if you have not wired `conversationId` yet - this brief assumes
you have.

---

## 0. TL;DR

Every conversation now has a **`title`**, and you can search on it.

```diff
  {
    "id": "c9e1...",
+   "title": "Onde esta meu pedido 4821?",
    "isDeleted": false,
    "createdAt": "2026-07-20T21:00:00.000Z",
    "updatedAt": "2026-07-21T09:12:00.000Z"
  }
```

Four changes, all **additive and non-breaking**:

| # | Change | Where |
| - | ------ | ----- |
| 1 | `title` on every conversation object | list, detail, rename and delete replies |
| 2 | `conversationTitle` on the chat reply | `POST /api/ai/chat` |
| 3 | `PATCH /api/ai/conversations/:id` to rename | new route |
| 4 | `?title=` substring filter | `GET /api/ai/conversations` |

If you do nothing, existing screens keep working. But your thread list currently
has nothing to label rows with, so item 1 is the one worth doing today.

---

## 1. Where titles come from

The title is **derived from the first message the user sent in that thread** -
normalized (whitespace collapsed) and cut to 80 characters on a word boundary,
with `...` appended if it was truncated.

```
user types:  "Olá! Queria saber   se o meu pedido 4821 já saiu para entrega, porque faz mais de uma hora"
title:       "Olá! Queria saber se o meu pedido 4821 já saiu para entrega, porque faz mais..."
```

It is deliberately **not** written by the model. That keeps it free and instant -
but it also means a title is often a mediocre name for where the thread ended up.
**Give the user a visible rename affordance.** That is the whole reason `PATCH`
exists.

`title` is never `null` and never empty. A thread whose opening message was pure
whitespace gets `"New conversation"`. You do not need a fallback.

---

## 2. Rendering it

```ts
type Conversation = {
  id: string;
  title: string;          // NEW - never null, never empty
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
};
```

Two rules:

- **Insert it as text, never as HTML.** It is user-authored content echoed back.
  In React `{conversation.title}` is already safe; just never route it through
  `dangerouslySetInnerHTML`.
- **Clamp it in CSS, do not re-truncate in JS.** The server already cut it to 80
  characters at a word boundary. Cutting again mid-word undoes that. Use
  `text-overflow: ellipsis`.

The chat response carries it too, on **every** exchange rather than only the
first, so a reopened thread can render its header without an extra request:

```ts
type ChatResponse = {
  conversationId: string;
  conversationTitle: string;   // NEW
  reply: string;
  tokensSpent: number;
  balanceRemaining: number;
};
```

---

## 3. Renaming

```http
PATCH /api/ai/conversations/c9e1...
Content-Type: application/json

{ "title": "Pedido 4821" }
```

Replies `200` with the conversation object (same shape as a list item).

```ts
async function renameConversation(id: string, title: string) {
  return api.patch<Conversation>(`/ai/conversations/${id}`, { title });
}
```

### Validate before you send

| Rule | Server response if violated |
| ---- | --------------------------- |
| Not blank / not only whitespace | `422` |
| Max **80 characters** | `422` |
| Must be the caller's own live thread | `404` |

The server **rejects** an over-long title rather than truncating it, so a user who
pastes 200 characters gets an error, not a silent cut. Validate client-side and
show a live counter.

> **Counting trap.** The limit is 80 **code points**, not UTF-16 units. `"🌵".length`
> is `2` in JavaScript, so a `value.length > 80` check rejects a 41-emoji title the
> server would accept. Count with `[...value].length` (or `Array.from(value).length`)
> to agree with the backend.

```ts
const titleLength = (value: string) => [...value].length;
const isValidTitle = (value: string) =>
  value.trim().length > 0 && titleLength(value.trim()) <= 80;
```

### Read the response back

The server normalizes before storing: leading/trailing whitespace is trimmed and
internal runs (including newlines and tabs) collapse to single spaces. So what is
stored may differ from what was typed. Update your local state from the **response
body**, not from the string you sent.

### A rename does not reorder the list

`updatedAt` is deliberately preserved on rename - a rename is not "activity". So
renaming never moves a thread in the list.

**Consequence: patch the row in place. Do not refetch page one.** This is the
opposite of what you must do after sending a *message*, which does bump `updatedAt`
and does reorder the list.

---

## 4. Searching

```http
GET /api/ai/conversations?title=pedido&limit=20
```

Case-insensitive **substring** match, scoped to the caller's own threads.

### Four things to get right

1. **It returns a page, not a thread.** Titles are not unique - two threads can
   share one. There is deliberately no `/conversations/by-title/:title` route,
   because it could not answer honestly. Always render results as a list, even
   when there is exactly one.

2. **Keep sending `title` on every page.** It composes with the cursor; dropping
   it on page two silently widens the search to everything.

   ```ts
   async function searchConversations(title: string, cursor?: string) {
     const params = new URLSearchParams({ limit: '20' });
     if (title.trim()) params.set('title', title.trim());
     if (cursor) params.set('cursor', cursor);
     return api.get<Paginated<Conversation>>(`/ai/conversations?${params}`);
   }
   ```

3. **Blank means unfiltered.** An empty or whitespace-only `title` is ignored
   rather than matching nothing, so you can bind the input straight to the query
   without special-casing the empty state.

4. **Wildcards are literal.** `%` and `_` are escaped server-side, so a user
   searching `100%` gets threads containing "100%" - not everything starting with
   "100". Nothing to encode on your side beyond normal URL encoding.

### Debounce it

Every keystroke is a database query. Debounce ~300ms and cancel in-flight requests
so a slow response cannot overwrite a newer one:

```ts
useEffect(() => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    searchConversations(term, undefined, { signal: controller.signal })
      .then(setResults)
      .catch((e) => { if (e.name !== 'AbortError') throw e; });
  }, 300);

  return () => { clearTimeout(timer); controller.abort(); };
}, [term]);
```

Reset pagination whenever the term changes - a cursor from the previous search is
meaningless against a different filter.

---

## 5. Error handling

Unchanged from the rest of this API, but worth restating for the rename form:

| Status | Meaning | What to do |
| ------ | ------- | ---------- |
| `400` | Body is malformed (e.g. `title` is not a string) | Bug in your client |
| `404` | Not the caller's thread, or already deleted | Drop it from the list and refetch |
| `422` | Title blank or over 80 characters | Show it on the field; your client-side check should have caught this |

`404` is returned for a thread belonging to someone else *and* for one that does
not exist *and* for one already deleted - deliberately indistinguishable, so never
use the status to infer whether an id exists.

---

## 6. Rollout checklist

Smallest useful increments, in order:

- [ ] Render `title` in the thread list. Biggest payoff, ~one line.
- [ ] Render `conversationTitle` as the chat window header.
- [ ] Add a rename control (inline edit or a menu item), with the code-point
      counter and in-place update from the response.
- [ ] Add a debounced search box over `?title=`, resetting the cursor on change.

Nothing here is required for existing screens to keep working.
