# realtime-dashboard

A live metrics dashboard built to learn the things a 2026 senior frontend role asks about and I had
never shipped: the Next.js App Router rendering model, a real Pub/Sub fan-out path, and a two-token
auth mechanism I had to get wrong a few times before it worked.

Next.js 16 (App Router, React 19) · standalone `ws` gateway · Redis Pub/Sub · Postgres · Docker Compose

It is a portfolio project, so it optimises for being **read**: `docs/architecture-2026-09.md` has the
full map, and the interesting parts are the failure paths, not the feature list.

## Run it

Create a `.env` with `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `JWT_SECRET` (signs the access token —
any long random string) and `RESEND_API` (only used to email registration OTPs). `new Pool()` and
`new Redis()` take no arguments anywhere in this repo; all connection config comes from these vars,
so pointing at another database means changing `PGDATABASE` and nothing else.

```bash
docker compose up -d        # Postgres :5432 + Redis :6379, reads the PG* vars
npm install
npm run dev                 # Next app       :3000
npm run server              # WS gateway     :8080
npm run producer            # fake metrics -> Redis, every 5s
```

All three Node processes must be up for live data. That is a known wart — see
[Not built yet](#not-built-yet).

## How it works

```
producer.js --PUBLISH metric:<name>--> Redis --psubscribe--> ws-server.js --> subscribed sockets
                                                                  |
                                                                  +--> INSERT into metrics (history only)
```

- **Initial value comes from Postgres over HTTP; every value after that comes from the socket.** SSR
  is for "correct at request time", not "stays fresh". The DB is never on the live-update path — that
  is the whole reason Pub/Sub is here rather than a polling query.
- **`'use client'` sits on the leaf.** The metric card (title, icon, layout) stays a Server Component;
  only the live value inside it is a Client Component that subscribes.
- **The WS wire format is a bare metric name string.** No JSON envelope, no message type. The gateway
  keys `Map<metricName, Set<ws>>`. One string is the Redis channel suffix, the DB column value and
  the subscribe payload.

## Auth

Access token in memory only (15 min), refresh token in an httpOnly cookie (7 days, sliding, inside a
hard 30-day session).

- **Nothing durable is stored client-side.** An XSS bug should not hand over a credential that
  outlives the tab, so the access token lives in a singleton's private field — never `localStorage`.
- **`src/proxy.ts`** (Next 16's renamed `middleware.ts`) verifies the JWT at the edge with `jose` and
  injects `x-user-id`. Route handlers read the user from that header and never parse the token
  themselves. Trusting the header is safe because every matching request is forced through the proxy
  in-process and `Headers.set()` overwrites anything the client sent.
- **Pages are gated client-side, APIs at the edge.** The access token is in memory, so a plain
  browser navigation carries no `Authorization` header and the proxy could never see it. Page gating
  is UX; the API layer is the real boundary.
- **Refresh tokens rotate and reuse is treated as theft** — presenting a token that already has
  `used_at` set revokes every token for that user.
- **Revocation is checked only at `/api/auth/refresh`**, not per request. That accepts a ≤15-minute
  window of validity after logout in exchange for zero DB hits on the hot path.
- **WebSockets authenticate with a ticket, not a token.** The client POSTs `/api/ws-ticket`, gets a
  UUID stored in Redis as `ws:ticket:<uuid>` with `EX 10 NX`, and passes it as a query param. The
  gateway `GETDEL`s it — single-use by construction — and closes with `4401` if it is missing or
  already spent. A JWT in a URL would sit in logs and history for its full 15 minutes; a
  10-second single-use ticket is worthless the moment it is redeemed.

## What broke, and what it taught me

These are the bugs worth the writeup. Every one of them produced the same symptom — an infinite loop
of failing `/api/auth/refresh` calls — from a different cause.

1. **`refreshAccessToken` called `apiFetch`, which calls `refreshAccessToken`.** Stack overflow on
   page load. The single-flight guard did not help: `pendingRefresh = apiFetch(...)` cannot be
   assigned until `apiFetch` returns a promise at its first `await`, but `apiFetch` recurses *before*
   that point, so the guard is still `null`. **A layer cannot consume the layer built on top of it.**
2. **Rotation in place made the server accuse itself of token theft.** One `UPDATE` set both
   `used_at = now()` and the new `token_hash` on the same row. The next *legitimate* refresh found
   that row by the new hash, saw `used_at` populated, read it as replay, and revoked the entire
   session on refresh #2. Fixed by `INSERT`ing a new row and only stamping `used_at`/`replaced_by` on
   the old one, leaving its hash intact as the tripwire. **Rotation with reuse detection structurally
   needs two rows — one cannot express both states.**
3. **`session_created_at` has to be carried forward, not re-stamped.** The 30-day absolute cap reads
   that column, so a fresh `NOW()` on every rotation reset the clock every 15 minutes and the cap
   could never fire. A security control that silently never triggers is worse than no control.
4. **A missing `try/finally` around a transaction exhausted the connection pool.** Any throw after
   `BEGIN` leaked the client with the transaction open. `Pool` defaults to 10 connections, so the
   tenth failure hung *every* query, including login, forever. Now `ROLLBACK` + rethrow in `catch`,
   one `release()` in `finally` — and explicit `ROLLBACK`s on early returns, because releasing a
   client mid-transaction poisons whoever borrows it next.
5. **Dead-session 401s have to delete the cookie.** Otherwise the browser keeps replaying a token the
   server has already declared dead, and the client retries into the same wall.

## Edge cases handled on purpose

- **Concurrent 401s cause one refresh, not N.** `refreshAccessToken` is single-flight via a
  module-level promise with no `await` between creation and storage.
- **`apiFetch` retries exactly once** — structurally, by not being recursive, rather than with a
  counter.
- **A rejected refresh notifies session death from the refresh path, not from `apiFetch`.** A failed
  refresh *is* session death regardless of who asked, including the provider's mount refresh.
- **Three-state auth status** (`checking | authenticated | unauthenticated`) so a reload does not
  flash the login screen during the silent refresh.
- **The provider's mount refresh is not redundant.** Without it the gate blocks rendering, nothing
  calls `apiFetch`, and status never leaves `checking` — a deadlock.
- **`/api/auth/logout` is excluded from the proxy matcher.** It authenticates off the cookie and the
  client clears the access token before calling it, so gating it made logout a permanent 401 no-op.
- **A `4401` socket close refreshes the token and reconnects once**, then falls through to normal
  backoff. A stale ticket and a dead session look identical from the socket's side, so it tries the
  cheap explanation first.
- **The `Toaster` lives outside `AuthProvider`** so a success toast survives the logout redirect.

## Not built yet

Honest list, in the order it matters:

- **Virtualized event-log table** (100k+ rows) — the next phase.
- **Feature flags.**
- **Docker Compose only runs Postgres and Redis.** The three-process startup is the biggest barrier
  to running this cold on someone else's machine.
- **No measured performance numbers** (LCP/CLS/INP, bundle size) and no WCAG 2.1 AA pass.
- **AWS is a design doc, not a deployment** — deliberately, for a frontend portfolio project.
- **Logout failure can resurrect a session.** If the POST never lands, `revoked_at` stays null and the
  cookie survives, so a reload silently signs you back in. Needs a retry plus an honest error toast —
  though it bottoms out at "a client-initiated logout can never be guaranteed". The real answers are
  short refresh TTLs and a server-side sign-out-everywhere.
- **No OTP brute-force limit** on `/api/auth/verify-otp`.
- **No test framework, by decision.** Checks, where warranted, are `assert` blocks in the file under
  test.

Schema DDL currently lives at the top of `src/ws-server.js`, which means the WebSocket server owns
the schema for the whole system. That accreted rather than being decided, and it is first on the list
in `docs/architecture-2026-09.md`.

`// ponytail:` comments mark deliberate simplifications and name their ceiling. Read them before
fixing the code they sit on.
