# Build-vs-Adapt Decision: Build on Judge0 CE vs Adapt DMOJ

*Deliverable 0 per spec §2 · Prepared 2026-08-07 · Recommendation at the end*

## The two candidates

**Build on Judge0 CE** — write our own platform (Node/TypeScript API, Next.js frontend, Postgres, Redis) and delegate only code execution to a self-hosted Judge0 CE (latest CE release v1.13.x; open source, isolate-based sandboxing, 60+ languages, per-submission time/memory limits, full verdict taxonomy).

**Adapt DMOJ** — deploy the DMOJ online-judge (Django/Python, AGPL-3.0, battle-tested at dmoj.ca and national olympiads), theme it, and extend it where the spec goes beyond it.

## Spec coverage

| Spec area | DMOJ out of the box | Build-on-Judge0 |
|---|---|---|
| Problems, hidden tests, partial/binary scoring, custom checkers | ✅ Yes, mature | Build (~straightforward) |
| Contests: formats, virtual participation, frozen scoreboards, ratings (Elo-MMR) | ✅ Yes, mature | Build |
| Live leaderboard updates | ✅ Yes (event server) | Build (Socket.IO) |
| Plagiarism (MOSS), editorials, discussion | ✅ Yes | Phase 3 build |
| **Quiz/MCQ rounds feeding the same leaderboard** | ❌ Not present | Build |
| **"Most improved" view, configurable ranking tabs** | ❌ Not present | Build |
| **Instance settings: branding, signup mode, module toggles as config** | ❌ Hardcoded/theming work | Native from day 1 |
| **CSV import with external_id/roll-no + groups as first-class** | ⚠️ Partial (orgs exist; import is admin-shell work) | Native |
| Public no-login leaderboard URL | ⚠️ Possible with config | Native |
| Monaco editor, run-vs-submit | ⚠️ Ace editor; run-on-samples not native | Native |
| Tab/paste telemetry | ❌ Not present | Phase 3 build |

Honest read: **DMOJ covers roughly 60–70% of the spec**, and the parts it covers (judging correctness, contest formats, ratings) are the hardest to get right. But the remaining 30–40% is precisely the product's differentiation: quiz rounds, most-improved, config-not-code instance behavior, group-centric reporting.

## Effort & risk comparison

**Adapt DMOJ**
- *Wins:* judging, contests, and ratings proven at scale for a decade; MOSS, editorials, virtual participation free.
- *Costs:* Large, mature Django codebase (~10k commits) with its own judge protocol and event server — extending it means learning its internals first. Quiz module, most-improved, and instance-settings would be invasive forks, and every fork diverges from upstream (last major release v4.0.0, Jan 2023 — slow cadence means long-lived local patches). AGPL-3.0 obliges source publication of modifications for network use — fine for this project, but a governance point. DMOJ's own judge workers replace Judge0, so the "battle-tested Judge0" decision in §2 is moot under this path.
- *Ops:* Django + MySQL-leaning defaults + custom judge daemons + event server. Runs on one VPS, but more moving parts than the spec's docker-compose ideal, and debugging requires Python/Django fluency.

**Build on Judge0**
- *Wins:* Every org-specific behavior is config from the first commit — no fighting an existing schema. Small, modern, single-language codebase (TypeScript end-to-end) a 1–3 person team can fully own. Judge0 handles the genuinely dangerous part (sandboxed execution); one CVE-patched release line to track. Quiz module and leaderboard views are just… features, not forks.
- *Costs:* We re-implement scoring, contest timing, freeze logic, and ratings — all subtle. Mitigation: spec §9 already mandates exhaustive unit tests on scoring + ordering, and these are pure functions, the most testable code in the system. Realistic Phase 1: 4–6 weeks part-time, as scoped.
- *Ops:* One docker-compose (web, API, Postgres, Redis, Judge0 + workers). Judge0 wants Ubuntu 22.04 with `systemd.unified_cgroup_hierarchy=0` (cgroup v1) — a documented one-line GRUB change; note Judge0 CE ships telemetry (disable via config).

## Recommendation

**Build on Judge0 CE.** The deciding factor is not effort-to-first-contest (DMOJ wins that) but effort-to-*this spec* and total cost of ownership for a tiny team. The spec's identity — program-agnostic config, quiz+code mixed contests, most-improved analytics, group-centric CSV reporting — sits exactly in the gap DMOJ doesn't fill, and filling it there means maintaining a permanent fork of a large Django system in a stack the team didn't choose. Building around Judge0 keeps the risky 20% (sandboxed execution) outsourced and the differentiating 80% small, owned, and testable.

**Borrow from DMOJ anyway:** its contest-format semantics (ICPC penalty rules, freeze behavior) and Elo-MMR rating design are excellent reference implementations for our scoring/rating modules — read, don't fork.

*Fallback trigger:* if Phase 1 slips past ~2× estimate or judging correctness proves shaky, revisit DMOJ with this table in hand.
