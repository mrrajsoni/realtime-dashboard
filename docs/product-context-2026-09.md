# Product Context — 2026-09

Read every session via the `@` import in `CLAUDE.md`.

**Precedence:** closed decisions outrank constraints, which outrank vocabulary. If this file and
`CLAUDE.md` disagree, fix the lower-precedence one rather than living with both.

`CLAUDE.md` already carries the product summary and the constraints (commands, three processes, env
vars, additive DDL). This file holds the five sections it was missing. Nothing is duplicated on
purpose — a second copy of the commands list is a second thing to keep true.

## 1. The users

There are none. This is a solo portfolio project whose audience is a hiring engineer reading the repo
and a recruiter watching a two-minute demo. That audience changes what "done" means:

- Code is read more often than it is run. A clear failure path is worth more than a feature.
- The demo must survive being run cold on someone else's machine, which is why the three-process
  startup requirement is a real problem and not a footnote.
- No real users means no real load, so performance arguments are speculative. Do not optimise
  without a measurement.

## 2. Vocabulary

Terms this repo uses in a specific way, and the near-synonyms that are wrong.

| Use this | Never this | Why it matters |
|---|---|---|
| **proxy** (`src/proxy.ts`) | middleware | Next 16 renamed it. Grepping for "middleware" finds nothing and sends a reader hunting for a file that does not exist. |
| **metric name** (`userCount`) | metric id, channel | It is the `metric_name` column, the Redis channel suffix, *and* the WS subscribe payload. One string doing three jobs. |
| **title** (`Total users`) | name, label | Display only. Lives in `FAKE_METRICS_GRID` in `Metrics.tsx`, never reaches the database. |
| **channel** (`metric:userCount`) | topic, metric | Always the `metric:` prefix plus the metric name. Saying "channel" for a bare metric name causes off-by-one-prefix bugs. |
| **session** | login, token | The 30-day chain from one login, carried by `session_created_at` across every rotation. |
| **token** | session | One row in `refresh_tokens`, 7-day lifetime. |
| **access token** | auth token, JWT (loosely) | 15 minutes, memory only, signed with `JWT_SECRET`. |
| **refresh token** | auth token, cookie | 7 days, httpOnly cookie, stored as a sha256 hash. |
| **rotation** | refresh | Issuing a new refresh token and marking the old one `used_at`. "Refresh" is the endpoint and the client function, not the act. |
| **reuse** | replay | Presenting a token that already has `used_at` set. Triggers the theft response. |
| **ticket** | token | The 10-second Redis UUID for WebSocket auth. Calling it a token invites someone to sign it. |
| **trend** | direction, delta | The stored `'up' \| 'down'` string. Computed by the producer, never derived client-side. |

**Redis key namespaces are colon-segmented and do not match their route names.** Channels are
`metric:<metricName>`; WS tickets are `ws:ticket:<uuid>` — *not* `ws-ticket:`, even though the route
is `/api/ws-ticket`. This line exists because an unbriefed reader guessed `ws-ticket:` from the route
name and wrote code that would never find the key.

`session expired` and `token expired` are different states handled by different branches
(`api/auth/refresh/route.ts:56` and `:66`). Do not merge them.

## 3. Closed decisions

Settled. Do not reopen these without being asked to; an agent that relitigates them wastes the turn.

1. **Access token lives in memory only** — `authManager`, never `localStorage` or `sessionStorage`.
   Reason: an XSS bug should not yield a durable credential.
2. **Refresh tokens rotate, and reuse is treated as theft.** Sliding 7-day token inside a hard 30-day
   session. Reuse revokes every token for that user.
3. **No test framework.** Checks, where warranted, are `assert`-based blocks in the file under test.
   Do not add Jest or Vitest. (This supersedes the bare "No test suite exists" line in `CLAUDE.md` —
   the absence is a decision, not an accident.)
4. **`new Pool()` and `new Redis()` take no arguments, ever.** All connection config comes from
   environment variables. To point at a different database, change `PGDATABASE`.
5. **The WebSocket wire format is a bare metric-name string.** No JSON envelope, no message type
   field. If a second message kind is ever needed, that is the moment to reconsider — not before.
### Open, and explicitly not closed

**Where the schema lives.** All DDL sits at the top of `src/ws-server.js`, so the WebSocket server
owns the schema for the whole system. This was never decided — it accreted, and there is no ticket
behind it. `docs/architecture-2026-09.md` names it as the first thing to change.

Ask before building anything new on top of it. This entry exists because a decision with no ticket
behind it is exactly the kind an agent will happily rebuild and defend.

## 4. What good output looks like

Not a description. This is real code from this repo, kept because it is right:

```ts
// Every 401 here means the refresh token is dead for good, so clear the cookie —
// otherwise the browser keeps replaying it and the client retries into the same wall.
function deadSessionResponse(message: string) {
  const response = NextResponse.json({message}, {status: 401});
  response.cookies.delete('refreshToken');
  return response;
}
```

The comment explains **why**, not what, and names the failure it prevents — a retry loop — so a
future reader knows what breaks if they delete it.

`// ponytail:` comments mark deliberate simplifications with their known ceiling. Read them before
"fixing" the code they sit on.

## 5. What stays out

**REFUSAL: `.env` values never enter a prompt — mine or an agent's, verbatim or paraphrased.**

Reason: `JWT_SECRET` *is* the auth model here. `src/proxy.ts` verifies every API request against it
and nothing else, so anyone holding it can mint a token for any `userId`. There is no second factor
that would catch a forged token, which means a leak is silent — nothing would tell me it happened.
And a secret pasted into a prompt persists in a transcript whose retention I do not control.

Partially enforced by deny rules in `.claude/settings.local.json`; the gaps are documented in
`docs/tool-and-data-surface-2026-09.md`. Treat the rule as binding regardless of whether the tooling
happens to stop you.

Also out:

- **No personal or customer data in this file.** `src/app/api/auth/register/route.ts` hardcodes a
  recipient address; that address is deliberately not reproduced here, because a file read every
  session would put it in every session.
- **Do not run the register flow to test something else.** It sends real email through Resend.
- **No commits or pushes without me reading the diff.** Currently a habit, not a control.
