# Load-test report — 300-submission contest burst

*Phase 3 deliverable (spec §9). Reproduce with `npx tsx api/scripts/loadtest.ts` against a running stack.*

## Setup

- Single host, all services co-located (API, worker ×1 at concurrency 4, Postgres 16, Redis 7).
- Judge0 replaced by a protocol-compatible mock (instant verdicts) — this isolates
  the **platform's** queueing/scoring path; real judging throughput is a Judge0
  sizing question, covered below.
- 30 seeded participants × 10 rounds = **300 submissions** through the real API
  path: JWT auth, per-user rate limits, 15s cooldown, one-in-flight rule, BullMQ.
  Rounds fire as 30-way concurrent bursts, ~16s apart ≈ "the final minutes of a
  contest".

## Results

| Metric | Value |
|---|---|
| Attempted / accepted | 300 / **300** (0 rejected) |
| Accept latency p50 / p95 / max | **286ms / 643ms / 847ms** |
| Submit phase duration | 149s (~2.5 min) |
| Queue drain after last burst | **1.1s** (mock judge) |
| Worker-kill recovery | worker SIGKILLed mid-judge → job retried on restart → AC recorded, no data loss |

The API accepted every burst without shedding; latency stayed sub-second at p95
under 30-way concurrency. The queue (BullMQ, 3 attempts, exponential backoff)
absorbed the bursts and survived a hard worker kill — acceptance walkthrough #5.

## What this doesn't measure: real judging throughput

With real Judge0, per-submission time ≈ (compile + per-case run) × cases.
A Python solution on a 6-case problem at ~1s/case ≈ 4–8s of judge time.
Sizing rule of thumb for a 300-burst:

```
drain_minutes ≈ 300 × avg_judge_seconds / (60 × judge0_workers × platform_worker_concurrency)
```

e.g. 6s average, 3 judge0-workers × concurrency 4 → ~2.5 minutes to drain — the
"position in queue" indicator keeps the UI honest during that window.

## Findings & fixes made during testing

1. **Rate limits were keyed by IP** — a campus lab behind one NAT IP would have
   throttled all 150 participants collectively. Fixed: submissions limit per
   *user*, login limit per *email+IP*; `trust proxy` enabled for Caddy.
2. **Queue cap behaves correctly**: with `QUEUE_CAP` reached, the API returns
   503 with a clear message rather than accepting silently.
3. Leaderboard rebuild cost is bounded by the 5s Redis cache — burst traffic
   does not stampede Postgres.

## Contest-day checklist (8 GB VPS)

- `docker compose up -d --scale worker=4 --scale judge0-workers=3`
- Watch `GET /admin/judge/health` (queue depth + Judge0 workers).
- Keep base time limits tight (≤2s) — judge seconds are the scarce resource.
