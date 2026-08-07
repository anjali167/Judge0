# Architecture & decisions

## Stack (spec §7 — choices and justification)

**API: Node 22 + TypeScript + Express** (not NestJS, not FastAPI).
One language across the whole codebase keeps a 1–3 person team in a single
toolchain, and the real-time pieces (Socket.IO, BullMQ) are first-class in Node.
Express over NestJS: this API is ~15 route files of straightforward CRUD +
one worker; NestJS's DI/module machinery would add concept count without
paying rent at this size. Structure is kept by convention: `routes/` (I/O),
`scoring/` + `leaderboard/standings.ts` (pure logic), `judge/` (queue + Judge0).

**Frontend: Next.js 15 + Tailwind 4 + Monaco + Socket.IO client.** The app is a
client-rendered SPA (auth token in browser storage) served by Next; standalone
output keeps the Docker image small. Mobile-first tables — the leaderboard is
usable on a phone.

**Data: Postgres 16 (Prisma) + Redis 7.** Prisma uses the engine-free
(`engineType = "client"`) generated client with the `pg` driver adapter — no
native engine binaries in the image. Redis carries three concerns:
the BullMQ judge queue, a 5s leaderboard cache, and pub/sub from workers to the
Socket.IO layer (so `--scale worker=N` just works).

**Judge: Judge0 CE v1.13.1, self-hosted, with its own Postgres/Redis** (upstream
default). Sharing our DB would couple failure domains and Judge0 pins Postgres 13;
keeping it isolated means we can nuke/upgrade the judge without touching platform
data. Judge0 telemetry is disabled in `deploy/judge0.conf`; sandbox runs have no
network (`ENABLE_NETWORK=false` + isolate).

## Submission pipeline

```
POST /submissions ──▶ BullMQ queue (Redis) ──▶ worker
                                                │ per test case: Judge0 wait=true
                                                │ verdicts → pure scoring fn
                                                ▼
                                    Postgres (submission + per-case results)
                                                │ publish leaderboard:update
                                                ▼
                          api Socket.IO ──▶ contest room ──▶ browsers
```

Design points:

- **Queue in front of the judge** (spec §6): the API accepts bursts instantly and
  returns a queue position; workers drain at judge capacity. Jobs retry ×3 with
  backoff, so a killed worker container loses nothing (acceptance test #5).
- **`wait=true` against Judge0** keeps state in one place (BullMQ). Judge0's own
  async mode + webhooks would add a second queue and a callback surface for
  little gain at this scale.
- **Run vs Submit**: run judges sample cases only and stores no contest linkage;
  submit runs the full suite and scores. Compile errors short-circuit the suite
  and surface compiler output (never hidden-case data — per-case results expose
  verdict + time only).
- **Scoring and ordering are pure functions** with exhaustive unit tests. ICPC
  conventions: CE attempts un-penalized; penalty = solve-minute + 10×wrong-attempts
  (configurable per contest); ties share a rank (1,2,2,4), broken by penalty then
  earliest last improvement.

## Security model

- argon2id password hashes; JWT (12h) role-gated routes; rate limits on auth
  (30/15min) and submissions (10/min + server-side cooldown + one in-flight per
  user + global queue cap).
- Hidden test case content is never serialized to any participant-facing response
  — the submission detail endpoint returns per-case verdict/time only.
- Judge0 sandbox: isolate with cgroup limits, no network, bounded output size.
- Problem editing bumps `version`; `contest_problems.problem_version` snapshots
  what a contest ran against, so past results are never silently rewritten.
- All admin mutations append to `audit_log`.

## Phase 2/3 attachment points (already in the schema/design)

- `instance_settings` — branding, signup mode, module toggles (read at runtime).
- `contests.scoring_config`-style extensions live naturally on the contest row
  (freeze time, virtual participation windows).
- Ratings/most-improved: computed from `submissions` + contest history; a
  `ratings` table migration is additive.
- Quiz module: separate tables feeding the same standings pipeline — the
  leaderboard consumes `(userId, problemId→itemId, score, time)` tuples and is
  agnostic to their source.
