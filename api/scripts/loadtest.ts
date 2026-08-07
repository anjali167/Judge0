/**
 * Contest-burst load test (spec Phase 3): ~300 submissions in a contest's
 * final minutes — 30 participants × 10 rounds, each round as a concurrent
 * burst, respecting the real API path (auth, cooldowns, queue).
 *
 * Usage: API + worker + judge (or mock) + seeded DB running, then
 *   npx tsx scripts/loadtest.ts [apiUrl]
 */

const API = process.argv[2] ?? "http://localhost:4000";
const USERS = 30;
const ROUNDS = 10;
const SOURCE = "a,b=map(int,input().split());print(a+b)";

interface Timing {
  acceptMs: number;
  status: number;
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email}: ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

async function submit(token: string, problemId: string, contestId: string): Promise<Timing> {
  const t0 = performance.now();
  const res = await fetch(`${API}/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ problemId, contestId, language: "python", source: SOURCE, mode: "submit" }),
  });
  await res.text();
  return { acceptMs: performance.now() - t0, status: res.status };
}

async function waitDrained(token: string): Promise<void> {
  for (;;) {
    const res = await fetch(`${API}/admin/judge/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { queueDepth } = (await res.json()) as { queueDepth: number };
    if (queueDepth === 0) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function main() {
  const admin = await login("admin@demo.local", "admin1234");

  // fresh live contest for the test
  const problems = (await (
    await fetch(`${API}/admin/problems`, { headers: { Authorization: `Bearer ${admin}` } })
  ).json()) as { id: string; slug: string }[];
  const problem = problems.find((p) => p.slug === "sum-two")!;
  const contest = (await (
    await fetch(`${API}/admin/contests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin}` },
      body: JSON.stringify({
        title: `Load test ${process.env.LOADTEST_ID ?? "run"}`,
        startsAt: new Date(Date.now() - 60000).toISOString(),
        endsAt: new Date(Date.now() + 3600000).toISOString(),
        problems: [{ problemId: problem.id }],
      }),
    })
  ).json()) as { id: string };

  const tokens = await Promise.all(
    Array.from({ length: USERS }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      return login(`student${n}@demo.local`, `2026${String(i + 1).padStart(3, "0")}`);
    })
  );
  console.log(`logged in ${tokens.length} participants; contest ${contest.id}`);

  const timings: Timing[] = [];
  const tStart = performance.now();
  for (let round = 1; round <= ROUNDS; round++) {
    const results = await Promise.all(tokens.map((t) => submit(t, problem.id, contest.id)));
    timings.push(...results);
    const ok = results.filter((r) => r.status === 202).length;
    console.log(
      `round ${round}: ${ok}/${USERS} accepted, ` +
        `p95 accept ${Math.round(pct(results.map((r) => r.acceptMs), 95))}ms`
    );
    if (round < ROUNDS) await new Promise((r) => setTimeout(r, 16000)); // cooldown window
  }
  const submitPhaseSec = (performance.now() - tStart) / 1000;

  const tDrain = performance.now();
  await waitDrained(admin);
  const drainSec = (performance.now() - tDrain) / 1000;

  const accepted = timings.filter((t) => t.status === 202);
  const rejected = timings.filter((t) => t.status !== 202);
  console.log("\n==== RESULTS ====");
  console.log(`attempted:      ${timings.length}`);
  console.log(`accepted (202): ${accepted.length}`);
  console.log(`rejected:       ${rejected.length} (${[...new Set(rejected.map((r) => r.status))].join(",")})`);
  console.log(`accept latency: p50 ${Math.round(pct(accepted.map((t) => t.acceptMs), 50))}ms · p95 ${Math.round(pct(accepted.map((t) => t.acceptMs), 95))}ms · max ${Math.round(Math.max(...accepted.map((t) => t.acceptMs)))}ms`);
  console.log(`submit phase:   ${submitPhaseSec.toFixed(1)}s`);
  console.log(`queue drain:    ${drainSec.toFixed(1)}s after last submit`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
