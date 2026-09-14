# Context File — Unedited-Use Test, 2026-09

## Method, and how it differs from the exercise

The exercise asks for a colleague using the file unedited, with no verbal briefing. This is a solo
repo with no colleague on it, so the stand-in was **a fresh headless Claude Code session**
(`claude -p`), which loads `CLAUDE.md` — and through it `@docs/product-context-2026-09.md` — and has
no memory of the conversation that produced either file.

Why this is a fair proxy: the failure mode the test hunts for is *knowledge that lives in the author's
head and not in the file*. An agent with zero session context cannot supply that knowledge from
sympathy or shared history, which is exactly the thing a real colleague struggles to switch off.

Why it is not equivalent: an agent will not stop and say "this makes no sense to me." It fills gaps
silently and confidently. So this test finds **wrong** answers, not **confused** readers. A human
colleague is still owed a look, and that is what goes to the cohort.

Both probes added one instruction not in the exercise — *"answer from your loaded context only, do not
read or search any files"* — because a session with tools will read the source and pass the test on
the code's strength rather than the file's. That instruction is the harness for the test, not a
briefing about the product.

## Probe 1 — does the vocabulary survive an unbriefed drafting task?

**Prompt:** Draft a two-sentence changelog entry for the in-progress WebSocket authentication work in
this project, using this project's own terminology. Answer from your loaded context only — do not read
or search any files.

**Response:**

> **WebSocket auth (in progress).** `/api/ws-ticket` now mints a short-lived ticket — a 10-second UUID
> stored in Redis under `EX 10 NX` — that the client can pass on the WebSocket URL. `ws-server.js`
> parses `req.url` but does not yet redeem the ticket, so connections are still unauthenticated.
>
> Terminology check: *ticket* (not token), *proxy* (not middleware) — untouched here, since
> `/api/ws-ticket` sits behind it and reads `x-user-id`.

**Result: pass.** It said *ticket* throughout and volunteered the proxy/middleware distinction without
being asked about it. The vocabulary table is doing work.

## Probe 2 — does the file prevent a wrong move?

The harder test. Vocabulary is cheap; the question is whether the closed decisions hold when the model
has a natural instinct to violate them.

**Prompt:** Propose how to finish the WebSocket ticket redemption in this project. Answer from your
loaded context only — do not read or search any files. Be brief.

**Response (abridged):**

```js
wss.on('connection', async (ws, req) => {
  const ticket = new URL(req.url, 'http://x').searchParams.get('ticket');
  const userId = ticket && (await redis.getdel(`ws-ticket:${ticket}`));
  if (!userId) return ws.close(1008, 'bad ticket');
  ws.userId = userId;
});
```

> **Skipped**
> - No JSON envelope / auth message — ticket rides the URL, decision 5 stays intact.
> - No per-metric authorization — every user sees every metric today.
> - No DDL, so the "who owns the schema" open question stays untouched.
>
> Check to leave behind: an `assert` block that a second `getdel` on the same key returns `null`.

**Result: pass on the decisions, fail on one fact.**

What held, unprompted:

- Cited **decision 5** by number and declined to add a JSON auth envelope — the obvious thing to reach
  for, and the thing the file exists to stop.
- Proposed an `assert` block rather than a test framework, matching **decision 3**.
- Left the schema open question alone instead of tidying the DDL on the way past.
- Incidentally supplied the fix for the `new URL(req.url)` crash by passing a base.

## The failure — and the missing line it exposed

It wrote the Redis key as `` `ws-ticket:${ticket}` ``. The real key, set in
`src/app/api/ws-ticket/route.ts`, is `` `ws:ticket:${ticket}` `` — colon-segmented, not
hyphenated. Redemption would silently find nothing, and the symptom would be "every WebSocket
connection is rejected as a bad ticket" with no clue pointing at a string.

The inference was reasonable: the route is `/api/ws-ticket`, so the key must be `ws-ticket:`. Nothing
in the file said otherwise. **This is the thing I assumed was obvious** — that key namespaces are
colon-segmented and independent of route names — and it was obvious only because I typed them.

**Added to the vocabulary section:**

> **Redis key namespaces are colon-segmented and do not match their route names.** Channels are
> `metric:<metricName>`; WS tickets are `ws:ticket:<uuid>` — *not* `ws-ticket:`, even though the route
> is `/api/ws-ticket`.

## What I cut, so the file did not only grow

1. **Closed decision 6 (Prettier).** `CLAUDE.md` already states the Prettier rule in its conventions
   section. The context file opens by claiming it duplicates nothing on purpose, and then duplicated
   this. Cutting the duplicate rather than the claim.
2. **Three of the four "properties worth copying"** under what-good-looks-like. The exercise says to
   paste a real artifact *instead of* describing the qualities you want; I pasted the artifact and then
   described the qualities anyway. Four bullets became one line. This is the clearest example in the
   file of a section written because a context file "should have" one.

Net change: one line added, roughly nine removed.

## For the cohort

**The one thing the unbriefed reader had to be told:** Redis key namespaces are colon-segmented and
do not follow their route names. It guessed `ws-ticket:` from `/api/ws-ticket` — a sound inference,
and wrong, and the resulting bug would have presented as an auth failure rather than a typo.

**The honest caveat to raise:** an agent proxy finds wrong answers but never says "I do not
understand this." Anything in the file that is *confusing* rather than *absent* is still unmeasured,
and a human read is the only thing that finds it.
