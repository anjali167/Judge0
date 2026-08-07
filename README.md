# Contest Platform

A self-hosted, organization-agnostic contest and evaluation platform — problems with
hidden test cases, timed contests (code + quiz), multi-language judging (via
self-hosted [Judge0 CE](https://github.com/judge0/judge0)), season ratings, and a
real-time leaderboard with freeze + public sharing.

**Guiding principle:** participants are evaluated on exactly one thing — what they
solved, verified by test cases — and that performance is immediately visible on the
leaderboard. Everything organization-specific is configuration, not code.

## Status: Phase 1 + Phase 2

| Area | Status |
|---|---|
| Auth (JWT, argon2), open/invite signup modes | ✅ |
| CSV participant import with groups | ✅ |
| Problem bank: markdown statements, sample + weighted hidden tests, tags, difficulty | ✅ |
| Monaco editor, 5 languages, starter templates, run-vs-submit | ✅ |
| Judge0 integration behind a BullMQ queue (retries survive worker restarts) | ✅ |
| Verdicts AC/WA/TLE/MLE/RE/CE, per-case results, hidden data never leaves server | ✅ |
| Contests: scheduled, lobby countdown, partial & binary scoring, penalty time | ✅ |
| Live leaderboard: WebSocket push + polling fallback, overall + by-group tabs | ✅ |
| Practice archive with tag/difficulty filters, editorials | ✅ |
| Admin: problems/contests/groups CRUD, CSV export, judge health, audit log | ✅ |
| Quiz/MCQ rounds: single/multi/numeric/code-output, negative marking, per-user randomized order, same leaderboard | ✅ |
| Season rating (rank-percentile EMA) + most-improved tab (Δ vs trailing-k avg) | ✅ |
| Leaderboard freeze (final N min) + public no-login leaderboard URL | ✅ |
| Announcements banner · post-contest discussion · instance settings & branding | ✅ |
| Cross-contest participant reports (CSV) | ✅ |
| Plagiarism pipeline, tab/paste telemetry, virtual participation, badges | Phase 3 |

## Quick start (development)

```bash
# prerequisites: Node 22+, PostgreSQL 16, Redis 7
cd api && npm install
cp ../.env.example .env         # or export vars; defaults suit local dev
npx prisma generate
npx prisma db push              # creates the schema
npm run seed                    # demo data (see below)
npm run dev                     # API on :4000
npm run worker:dev              # judge worker (needs a running Judge0, see below)

cd ../web && npm install
npm run dev                     # UI on :3000
```

Judge0 for development: `docker compose up judge0-server judge0-workers judge0-db judge0-redis`

## Production deployment

See [docs/runbook.md](docs/runbook.md). Short version:

```bash
cp .env.example .env   # set real secrets + domain
docker compose up -d --build
docker compose exec api npm run seed   # optional demo data
```

> Judge0's isolate sandbox requires cgroup v1 on the host:
> add `systemd.unified_cgroup_hierarchy=0` to `GRUB_CMDLINE_LINUX` and reboot
> (documented in the runbook).

## Demo accounts (after seeding)

- Organizer: `admin@demo.local` / `admin1234`
- Participants: `student01@demo.local` … `student30@demo.local`, password = external id (`2026001` …)
- 10 problems across difficulties with full hidden suites, 3 groups, 1 past + 1 scheduled contest.

## Architecture

```
web (Next.js + Monaco + Socket.IO client)
  → api (Express + Socket.IO + zod; JWT auth)
      → Postgres (Prisma, engine-free client)
      → Redis (BullMQ judge queue · leaderboard cache · pub/sub)
  → worker (BullMQ consumer) → Judge0 CE (isolate sandbox, no network)
```

Scoring and leaderboard-ordering logic are pure functions
(`api/src/scoring/score.ts`, `api/src/leaderboard/standings.ts`) with exhaustive
unit tests (`npm test` in `api/`) — they are the product's trust anchor.

Design decisions and stack justification: [docs/architecture.md](docs/architecture.md).
The build-vs-adapt (Judge0 vs DMOJ) analysis: [docs/comparison-judge0-vs-dmoj.md](docs/comparison-judge0-vs-dmoj.md).

## License

MIT. Dependencies are MIT/Apache-2.0/BSD; Judge0 CE is GPL-2.0 (run as a
separate service, unmodified — free self-hosted use).
