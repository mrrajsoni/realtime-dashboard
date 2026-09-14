# Tool and Data Surface — 2026-09

Scope: solo work on `realtime-dashboard` with Claude Code. No employer systems involved, so
"who owns the tooling decision" collapses to one name — see the last section for why that matters.

## 1. What the agent reads

| Source                                                                     | Contents                                                                                   | Mechanism                                                      | Personal data?                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------- |
| `CLAUDE.md`                                                                | Repo conventions, commands, auth model                                                     | Auto-loaded every session                                      | No                                      |
| `~/.claude/projects/-Users-rajson-personal-realtime-dashboard/memory/*.md` | Phase plans, **backend development roadmap** (target countries, resume status, skill gaps) | `MEMORY.md` index auto-loaded; individual files read on recall | Yes — mine                              |
| Source files                                                               | App code                                                                                   | On demand via lean-ctx `ctx_read`                              | No                                      |
| Git history                                                                | Commit messages and metadata                                                               | On demand                                                      | Yes — my name and email on every commit |

The backend development roadmap is the surprise. It loads into context on any session in this repo, including
sessions where I'm only debugging a WebSocket. It is in context right now.

## 2. What it can reach

| System                  | Mechanism                                                       | Notes                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell in repo dir       | `Bash` / `ctx_shell`, permission-prompted                       | Not sandboxed to the repo. `~/.ssh`, `~/.aws`, browser profiles are all reachable                                                                         |
| `.env`                  | Plain file at repo root                                         | Real `JWT_SECRET`, `PGPASSWORD`, `RESEND_API`. Gitignored, so it never leaves via git — but that is a git control, not an agent control                   |
| Local Postgres (docker) | `psql`, or the app's own `pg.Pool()`                            | `users.email_address`, `users.pass_hash`, `otp_codes.otp_code_hash` — real bcrypt hashes for my real address                                              |
| Resend API              | Live key in `.env`                                              | **Sends actual email.** `src/app/api/auth/register/route.ts` hardcodes my gmail as the recipient. Any agent that runs the register flow mails me for real |
| Web egress              | `WebFetch` / `WebSearch`                                        | The only path by which repo content or memory content leaves this machine                                                                                 |
| lean-ctx MCP server     | Local process, blanket-allowed in `.claude/settings.local.json` | Third-party code with full file-read and shell execution. I have not read its source                                                                      |

The unaudited-PII answer for this repo: the `users` and `otp_codes` tables, plus the hardcoded
address in `register/route.ts`. Nothing sanitises them, nothing expires them, and the docker volume
`postgres_data` persists across `docker compose down`.

## 3. Where the work lives

Working tree on `main`, uncommitted. The agent edits files; I stage and commit. No agent has run
`git commit` or `git push` in this repo.

That last sentence is a habit, not a control. Nothing in the config enforces it.

## 4. What stays manual

- **Commits and pushes.** I read the diff first.
- **Anything that exercises the Resend key.** Sending mail is outward-facing and irreversible.
- **REFUSAL: `.env` values never enter a prompt — mine or an agent's, verbatim or paraphrased.**

  Reason: `JWT_SECRET` _is_ the auth model in this repo. `src/proxy.ts` verifies every API request
  against it and nothing else, so anyone holding it can mint a token for any `userId`. There is no
  second factor that would catch a forged token, which means a leak is silent — nothing would tell
  me it had happened. And a secret pasted into a prompt lives on in a transcript whose retention I
  do not control.

  If challenged: the objection would be "you're on localhost, the secret is worthless". True today.
  It stops being true the first time this repo gets deployed for a portfolio demo, and by then the
  secret will have been in a dozen transcripts. The rule has to predate the deployment.

## Instruction-shaped → access-shaped

**Before.** "Don't read `.env`" was an instruction. Earlier in this session the agent piped the file
through `sed` to redact the values before showing them. That was courtesy, not a control — a plain
`cat` was available and permitted.

**After.** Added to `.claude/settings.local.json`:

```json
"deny": [
  "Read(./.env)",
  "Read(./.env.*)",
  "Bash(cat .env:*)",
  "Bash(cat .env)",
  "Bash(source .env:*)",
  "Bash(env:*)"
]
```

**Who I had to ask: nobody. I own this file.** Which is the finding — the boundary stayed
instruction-shaped for weeks only because there was no one in a position to refuse me, so there was
never a moment where I had to say it out loud.

**What this control does not cover, stated plainly:**

1. `Bash` deny rules match on command prefix. `sed -n p .env`, `python -c "print(open('.env').read())"`,
   or a `node` one-liner all route around the list above. It raises the cost of an accident; it does
   not stop intent.
2. `mcp__lean-ctx__ctx_read` and `ctx_shell` are blanket-allowed, and MCP permission rules cannot
   match on arguments — only on tool name. So `ctx_read('.env')` is still permitted. Denying the tool
   outright would break the read path I use for everything.
3. The only fully access-shaped fix is for the secret not to be in the agent's reach at all: keep
   `.env` outside the repo tree and pass `--env-file=../secrets/realtime.env`, or load from the
   macOS keychain at process start.

So this is a partial control, and item 2 is a boundary that is still a request wearing an access
setting's clothes. Worth saying that out loud rather than filing the deny rule and calling it closed.

## Who owns the tooling decision

Me, for the repo, the permission config, and what I paste. Not me, and worth knowing I do not
control it:

- Anthropic's retention and training policy for what Claude Code transmits.
- The lean-ctx MCP author's handling of file contents that pass through the server.
- Resend's terms covering the addresses I put in that `to:` array.

## Sign-off I would not do alone

Nothing here — solo repo, and pretending otherwise would be theatre. The equivalent if this were
work code: any _standing connector_ as opposed to a one-off paste, and any tool holding write
credentials to a shared system. Those are requests, not boundaries I could set.
