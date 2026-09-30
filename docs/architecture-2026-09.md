# Architecture — 2026-09

`realtime-dashboard`. Mapped by reading source, not memory — line references are to the state of the
tree on 2026-09-01, which includes uncommitted WebSocket-auth work.

## Sketch

```typescript
                    │  BROWSER                                   │
                    │  AuthProvider → authManager (token in RAM) │
                    │  apiFetch            webSocketManager      │
                    └──┬───────────────────────────────┬─────────┘
                       │                               │
   HTTP: Bearer header │                               │ ws://localhost:8080
   + refreshToken cookie                               │ (message body = bare metric name)
                       ▼                               │
    ┌──────────────────────────────────┐               │
    │  NEXT SERVER  :3000              │               │
    │  proxy.ts → verify JWT,          │               │
    │             inject x-user-id     │               │
    │  /api/auth/{login,refresh,…}     │               │
    │  /api/metric    /api/ws-ticket   │               │
    └───┬──────────────────────┬───────┘               │
        │                      │                       │
        │ SQL                  │ SET ws:ticket:<uuid>  │
        │                      │ EX 10 NX              │
        │                      ▼                       ▼
        │            ┌──────────────────┐  ┌─────────────────────────────┐
        │            │  REDIS  :6379    │  │  WS SERVER  :8080           │
        │            │                  │  │  ws-server.js               │
        │ producer.js┼── PUBLISH ───────┼─▶│  psubscribe 'metric:*'      │
        │ (dev feeder│    metric:*      │  │  subscribersMap             │
        │  every 5s) └──────────────────┘  │  ★ CREATES ALL TABLES ★     │
        │                                  └──────────────┬──────────────┘
        │                                  INSERT metrics │
        ▼                                                 ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  POSTGRES  :5432                                             │
    │  users · refresh_tokens · otp_codes · metrics                │
    └──────────────────────────────────────────────────────────────┘
```

Five components. `producer.js` is a dev-only feeder, drawn but not counted — in a real deployment
whatever emits metrics replaces it and nothing else changes.

Three processes must run for the dashboard to show a number: `npm run dev`, `npm run server`,
`npm run producer`. Nothing enforces or checks this.

## The cross-component dependency

**The Next server's API routes depend on tables created by `src/ws-server.js` at boot.**

Every `CREATE TABLE IF NOT EXISTS` — `metrics`, `users`, `otp_codes`, `refresh_tokens` — sits at the
top of the WebSocket server (`ws-server.js:17-70`). There is no migration tool and no schema module.

Consequences, in order of how long each took to notice:

1. `npm run dev` on a fresh clone gives a running app with no schema. `/api/auth/register` fails on a
   table that does not exist, and the error surfaces as a 500 with no hint that the fix is starting an
   unrelated process.
2. The dependency is invisible from the Next side. Nothing in `src/app/api/**` references, imports, or
   mentions the process that owns its tables.
3. Schema changes have to be additive (`ADD COLUMN IF NOT EXISTS`) because the DDL re-runs on every
   WS-server restart. That constraint is real but undocumented — I only know it because I wrote it.

Related, same root: `new Pool()` is constructed independently **seven** times — once in `ws-server.js`
and once in each of the six route handlers — with no shared module. Seven pools against one Postgres.

## Data flow — login to a rendered number

```
login/page.tsx
  └─▶ POST /api/auth/login          bcrypt.compare · jwt.sign 15m · INSERT refresh_tokens
      └─▶ Set-Cookie: refreshToken (httpOnly, sameSite strict)
          └─▶ AuthProvider.handleOnLogin
              └─▶ authManager.setAccessToken   ← memory only, never localStorage
                  └─▶ AuthGate renders children (null while 'checking')
                      └─▶ useMetricData(metricName)
                          ├─▶ apiFetch('/api/metric?metric=…')   one row, initial value
                          │     └─▶ proxy.ts: jwtVerify → x-user-id → route handler
                          └─▶ webSocketManager.subscribe(metricName)   live updates thereafter
```

The split is the interesting part: HTTP supplies the first value, the WebSocket supplies every value
after it. Two transports, two auth stories — and only one of them currently has an auth story.

## Error path — `POST /api/auth/refresh`

Traced against `src/app/api/auth/refresh/route.ts`.

### Postgres unavailable

`pool.connect()` at `route.ts:26` is **outside** the `try`. When the container is down it rejects,
nothing catches it, Next returns 500. Then:

```
500 → refreshAccessToken.ts:16   if (response.status !== 200) throw 'AuthExpired'
    → authManager.notifySessionExpired()
    → AuthProvider → router.push('/login')
    → login page → POST /api/auth/login → also Postgres → also 500
```

An infrastructure failure and an authorization failure produce the identical outcome, and the client
resolves the ambiguity in the most destructive direction: it logs everyone out and sends them to a page
that cannot work. The cookie does survive — a 500 never reaches `deadSessionResponse` — so the state is
recoverable once Postgres returns, but nothing communicates that to the user.

### Postgres dies mid-transaction

```js
catch (error) {
  await client.query('ROLLBACK');   // dead connection → THIS throws
  throw error;                      // never reached
} finally {
  client.release();                 // no error arg → broken connection returns to the pool
}
```

Two effects: the real cause is replaced by `Connection terminated`, and pg keeps the poisoned
connection for the next request instead of destroying it (`client.release(err)` is the idiom that
destroys).

### Malformed or unknown cookie — handled correctly

Cookie present but not matching any `token_hash` → `route.ts:39` → 401 **and** the cookie is deleted.
The comment at `route.ts:124` explains why deletion is mandatory: otherwise the browser replays a dead
token forever and the client retries into the same wall. This path is right.

### Missing `JWT_SECRET` — handled correctly

`jwt.sign` at `route.ts:98` throws before `COMMIT` at `route.ts:102`, so the rollback undoes the token
rotation. The transaction boundary is drawn in the right place; the rotation is atomic with respect to
the thing that can fail after it.

### Reuse detection firing on legitimate users

`route.ts:60`: any refresh token with `used_at` set is treated as theft and triggers
`logoutAllDevices` — every token for that user revoked. There is no grace window. Two ordinary
situations reach it:

- **Two tabs.** The single-flight guard in `refreshAccessToken.ts` is a module-level `pendingRefresh`
  variable, so it deduplicates within one tab only. Two tabs send the same cookie; one wins the
  `FOR UPDATE` lock and sets `used_at`; the other unblocks, reads `used_at`, and nukes the session.
- **A dropped response.** `COMMIT` lands at `route.ts:102`, then the response is built and sent. If it
  never arrives — flaky network, closed laptop — Postgres has rotated but the browser still holds the
  old token. The next refresh looks exactly like theft.

_Not yet reproduced on my machine._ Whether two-tab logout fires in practice may depend on browser
throttling of background tabs. Stated as a code-reading finding, not an observed one.

## Evaluate

**Where the code stops explaining itself to a reader who is not its author.** Three places, all of
them things I knew implicitly and had never written down:

- Schema DDL in the WebSocket server (above).
- `src/hooks/useMetricData.ts` declares its own local `TMetricData` instead of importing the one in
  `src/types.definitions.ts`. The local copy omits `metricName`. Two types with one name, and the
  compiler is fine with it.
- `WebSocketManager.listeners` is `Map<metricName, callback>` — one callback per metric. Two components
  subscribing to the same metric means the second silently replaces the first, and the first stops
  updating with no error. `Metrics.tsx` currently uses three distinct metrics, so the bug is dormant
  rather than absent.

**What exploration surfaced beyond the README.** The README is unmodified `create-next-app`. It
documents none of the three processes, no docker-compose step, and no environment variables. Everything
in this document was absent from it.

**Also found:** `ws-server.js:74` does `new URL(req.url)`. In `ws`, `req.url` is a bare path like
`/?ticket=abc`, and `new URL('/?ticket=abc')` throws `Invalid URL` — verified by running it. That throw
is inside the `connection` handler, so live metrics are broken in the current working tree. This is a
bug in unfinished work, not debt, and is deliberately left unfixed: this exercise documents the tree as
it stands.

**What I would change first if I owned it.** Move the DDL out of `ws-server.js`. Not because it is the
most dangerous item here — the refresh-token grace window is — but because it is the one that makes
every other thing harder to investigate. You cannot reason about the schema while its owner is a
process you would not think to look in.

## Technical debt for the cohort

**Reuse detection treats an interrupted rotation as theft.**

It is debt rather than merely unfamiliar code because it encodes an assumption the product already
violates — that only one refresh is ever in flight per session — and when that assumption breaks, the
consequence is maximal (all devices revoked) and completely silent (nothing logged, user sees only a
login screen). The standard fix is a short grace window keyed on `replaced_by`: a token whose successor
was issued seconds ago is a retry, not an attack.

The argument I expect back: "rotation-with-reuse-detection is the textbook pattern, you implemented it
correctly." True — the mechanism is right. The gap is that the textbook version pairs it with a grace
window, and I shipped the detection without the tolerance.

## Open questions

Things I could not answer from reading, listed so the next investigation has a starting point:

1. Does two-tab logout actually reproduce, or does browser throttling mask it?
2. `/api/ws-ticket` mints a 10-second Redis ticket, and `ws-server.js` opens a second Redis client
   (`ticketRedisClient`) to redeem it — but never does. What is the intended handshake?
3. Seven connection pools: does this matter at one user, and at what point does it?
4. Deferred (multi-subscriber follow-up): each `useMetricData` mount does its own
   `GET /api/metric?metric=…`, so N cards on one metric = N point-reads that can briefly
   disagree across a 5s producer tick before WS fan-out reconverges them. At LinkedIn/Instagram/
   Netflix/YouTube scale this is solved with a replay cache (last value per metric, late
   subscriber gets it instantly) or deduped in-flight fetch. Skipped until a real large-data
   scenario exercises it.
5. Parked (multi-subscriber polish): `subscribe` re-sends the metric name on every call when
   the socket is OPEN (`WebSocketManager.ts:123-125`), so N cards on one metric = N identical
   frames; the server dedups via `Set.add` (`ws-server.js:109`), so correct but wasteful.
   Cleanup also touches the captured Set instead of re-getting from the map. At YouTube-live
   scale (100k watchers, one match) this is a subscribe storm for zero new information.
   Parked with item 4.

```

```
