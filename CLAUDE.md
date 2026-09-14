# CLAUDE.md

Realtime metrics dashboard: Next.js 16 (App Router, React 19) + a standalone `ws` server, Redis pub/sub, Postgres.

@docs/product-context-2026-09.md
@docs/mentorship-style-2026-09.md

`README.md` is the reader-facing writeup — design decisions, the auth bug post-mortems, and an honest "not built yet" list. It is the artifact a hiring engineer reads, so keep it true when behaviour changes; `docs/architecture-2026-09.md` holds the full source map.

## Commands

```bash
docker compose up -d      # Postgres (5432) + Redis (6379); reads PG* vars from .env
npm run dev               # Next app on :3000
npm run server            # WebSocket server on :8080 (node --env-file=.env)
npm run producer          # fake metric publisher -> Redis, every 5s
npm run lint              # eslint
npm run format            # prettier --write .
```

All three processes (`dev`, `server`, `producer`) must run for the dashboard to show live data. There is no test framework, by decision — see closed decision 3.

`.env` holds `PGUSER/PGPASSWORD/PGDATABASE`, `JWT_SECRET`, `RESEND_API`. Never pass connection options to `new Pool()` or `new Redis()` — all config comes from env vars. To point at a different database, change `PGDATABASE`.

## Data flow

`producer.js` → `PUBLISH metric:<name>` → `ws-server.js` (`psubscribe metric:*`) → inserts row into `metrics`, then fans out to sockets subscribed to that metric.

Client side: `useMetricData(metricName)` does one `apiFetch('/api/metric?metric=…')` for the initial value, then subscribes via the `webSocketManager` singleton. The WS wire protocol is deliberately trivial: client sends the bare metric name as the message body to subscribe; server keys `subscribersMap: Map<metricName, Set<ws>>`.

Schema (`metrics`, `users`, `otp_codes`, `refresh_tokens`) is created by `CREATE TABLE IF NOT EXISTS` at the top of `src/ws-server.js` — there is no migration tool. Schema changes go there, additive only (`ADD COLUMN IF NOT EXISTS`).

## Auth

Access token in memory only, refresh token in an httpOnly cookie.

- `authManager` (`src/Auth/AuthManager.ts`) — singleton holding the access token + session-expiry listeners. Never persist the token to localStorage.
- `apiFetch` — attaches `Authorization: Bearer`, refreshes on missing token, retries once on 401, then `notifySessionExpired()` and throws `AuthExpired`.
- `refreshAccessToken` — single-flight via a module-level `pendingRefresh` promise so concurrent 401s cause one refresh call.
- `/api/auth/refresh` — rotating refresh tokens under a `SELECT … FOR UPDATE` transaction. Reuse of an already-used token is treated as theft: revoke every token for that user. Any dead-session 401 must delete the cookie (`deadSessionResponse`).
- `src/proxy.ts` — Next 16's middleware equivalent. Verifies the JWT with `jose`, injects `x-user-id`, and matches `/api/*` minus the auth endpoints. Route handlers read the user from `x-user-id`, never from the raw token.
- `AuthProvider` / `useAuth` / `AuthGate` — `authenticationStatus` is `'checking' | 'authenticated' | 'unauthenticated'`; `AuthGate` renders `null` while checking to avoid a login flash.

WebSocket auth (built, uncommitted): `/api/ws-ticket` mints a short-lived Redis ticket (`ws:ticket:<uuid>`, `EX 10 NX`) holding the user id. `webSocketManager.connect()` is async — it POSTs for a ticket through `apiFetch` (single-flight via `requestedTicket`) and connects to `ws://localhost:8080?ticket=…`. `ws-server.js` `GETDEL`s the key, so a ticket is single-use by construction, and `close(4401)` on a missing or already-spent one. The client treats `4401` as a possibly-stale ticket: refresh the access token, reconnect once, then fall through to normal backoff.

A ticket, not a token, because a URL lands in logs and history — a 10s single-use UUID is worthless once redeemed. Never sign it (see the vocabulary table).

## Conventions

- Prettier: single quotes, no bracket spacing, width 100, semicolons. Run `npm run format` rather than hand-aligning.
- Path alias `@/*` → `src/*`.
- Shared types live in `src/types.definitions.ts` (`T`-prefixed types, `I`-prefixed interfaces).
- Cross-cutting singletons are instantiated at module scope and exported as instances (`authManager`, `webSocketManager`) — import the instance, don't build another.
- Components: default export, arrow function, one component per file. shadcn/base-ui primitives in `src/components/ui`, feature components in `src/app/components`.
- `react-hooks/exhaustive-deps` is off on purpose; effects with intentionally empty dep arrays are load-once by design.
- Toasts via `sonner` (`<Toaster>` is in the root layout).
- `// ponytail:` comments mark deliberate simplifications — read them before "fixing" the code they sit on.
