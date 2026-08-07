# Runbook

One page for the 1–3 part-time admins who operate this. If a routine task here
takes you more than 5 minutes a week, file a bug.

## First deployment

1. Ubuntu 22.04/24.04 VPS, 4–8 GB RAM, Docker + Docker Compose installed.
2. **One-time host change for Judge0's sandbox (isolate):**
   ```bash
   sudo sed -i 's/GRUB_CMDLINE_LINUX="/GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0 /' /etc/default/grub
   sudo update-grub && sudo reboot
   ```
3. `git clone <repo> && cd contest-platform`
4. `cp .env.example .env` — set `JWT_SECRET` (long random), both DB passwords,
   and your public URLs. Put the same Judge0 DB password in `deploy/judge0.conf`.
5. Edit `deploy/Caddyfile`: replace `:80` with your domain → automatic HTTPS.
6. `docker compose up -d --build`
7. Create the first admin: seed demo data (`docker compose exec api npm run seed`)
   and change the admin password, or insert a user row with role `SUPER_ADMIN`.

## Contest-day scaling

The queue absorbs bursts; workers are the throughput knob.

```bash
docker compose up -d --scale worker=4 --scale judge0-workers=3
```

Guidance: each `judge0-workers` replica ≈ 0.5–1 GB RAM under load; each platform
`worker` is lightweight (it only orchestrates). On an 8 GB VPS: 3–4 judge0-workers,
3–4 platform workers, leave ~2 GB for Postgres/web/api. Watch
`GET /admin/judge/health` (queue depth + Judge0 worker status) during the contest.

A killed worker container is safe: jobs retry (3 attempts, exponential backoff)
and unfinished submissions are re-judged when a worker returns.

## Backup & restore

Nightly dump (add to root's crontab on the host):

```cron
0 3 * * * cd /path/to/contest-platform && docker compose exec -T db pg_dump -U platform platform | gzip > /var/backups/platform-$(date +\%F).sql.gz
```

Restore:

```bash
gunzip -c platform-2026-08-01.sql.gz | docker compose exec -T db psql -U platform platform
```

Judge0's own DB holds only transient judging state — no backup needed.

## Adding a language

1. Find the language id: `curl http://localhost:2358/languages` (Judge0 CE ships 60+).
2. Add an entry to `LANGUAGES` in `api/src/judge/judge0.ts` (key, judge0Id, label).
3. Optionally add a starter template in `web/components/CodePanel.tsx` and a
   time multiplier in `api/src/scoring/score.ts` (defaults to ×3 if absent).
4. Rebuild: `docker compose up -d --build api worker web`.

## Routine operations

| Task | How |
|---|---|
| Import participants | Admin API `POST /admin/users/import` with `{csv}` — columns `external_id,name,email,group`. Default password = external_id. |
| Create a contest | `POST /admin/contests` (title, `type` CODE/QUIZ/MIXED, startsAt/endsAt ISO-UTC, problems+points, scoringMode PARTIAL/BINARY, `freezeMin` for a frozen finale, `makePublic: true` for a shareable no-login leaderboard URL, optional groupScope). |
| Author a quiz | `PUT /admin/contests/:id/quiz` with the full question array (SINGLE/MULTI/NUMERIC/CODE_OUTPUT; marks + negativeMarks). Question/option order is auto-randomized per participant. |
| Share the leaderboard | `makePublic` returns a `publicToken`; the read-only board lives at `/public/<token>` — no login, safe to project. |
| Finalize season ratings | Automatic on first leaderboard view after a contest ends; force with `POST /admin/contests/:id/finalize-ratings`. |
| Export results | `GET /admin/contests/:id/export.csv` (per contest) · `GET /admin/reports/participants.csv` (cross-contest: rating, ranks, solves by difficulty) |
| Post an announcement | `POST /admin/announcements` `{title, body}` — shows as a banner to everyone; deactivate with `PUT /admin/announcements/:id {active:false}` |
| Release an editorial | `POST /admin/problems/:id/release-editorial` |
| Check judge health | `GET /admin/judge/health` |
| Instance settings | `PUT /admin/settings` (super-admin): `instance_name`, `signup_mode` (`open`/`invite`), `modules` (`{quiz, mostImproved, discussion}` toggles), `most_improved_k` |
| Plagiarism scan | After a contest: `POST /admin/contests/:id/plagiarism-scan` (optional `{threshold: 0.75}`); review queue at `GET /admin/contests/:id/plagiarism-flags`; verdicts via `PUT /admin/plagiarism-flags/:id {status: DISMISSED\|CONFIRMED, reviewNote}`; side-by-side sources at `GET /admin/plagiarism-flags/:id/sources`. Flags are signals — scoring is never changed automatically. |
| Cheating signals | `GET /admin/contests/:id/telemetry` — per-participant tab-switch and paste counts collected during the live window. Signals only; participants are never blocked. |
| Virtual attempts | Participants self-serve from an ended contest's page. Virtual submissions never touch the official leaderboard or ratings. |

All admin actions are recorded in `audit_log`.

## Troubleshooting

- **Submissions stuck PENDING** → `docker compose logs worker judge0-server`.
  Usually Judge0 is down or the queue connection dropped; `docker compose restart worker`.
- **All verdicts IE** → Judge0 can't sandbox: check the cgroup v1 GRUB step, and
  that `judge0-workers` runs `privileged: true`.
- **Leaderboard not updating live** → clients fall back to 15s polling automatically;
  check `docker compose logs api` for socket errors. Data is still correct.
- **DB schema drift after a git pull** → `docker compose exec api npx prisma db push`.

## Timezones

Everything is stored UTC. Set contest times in UTC in the admin API; the UI
renders in each viewer's local timezone.
