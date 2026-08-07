/**
 * Demo seed (Definition of Done, spec §9): 10 problems with full hidden suites,
 * 3 groups, 30 participants, 1 past contest + 1 scheduled contest, 1 admin.
 *
 * Demo credentials: admin@demo.local / admin1234 — participants: <email> / <external_id>
 */
import argon2 from "argon2";
import { prisma } from "../src/db.js";
import { TestCaseKind } from "../src/generated/prisma/enums.js";

interface SeedCase {
  kind: TestCaseKind;
  ordinal: number;
  input: string;
  expectedOutput: string;
  weight?: number;
}

interface SeedProblem {
  slug: string;
  title: string;
  difficulty: number;
  tags: string[];
  statementMd: string;
  editorialMd: string;
  cases: SeedCase[];
}

/** Deterministic pseudo-random for reproducible seeds. */
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const ri = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

function casesFrom(
  fn: (input: string) => string,
  inputs: string[],
  sampleCount = 2
): SeedCase[] {
  return inputs.map((input, i) => ({
    kind: i < sampleCount ? TestCaseKind.SAMPLE : TestCaseKind.HIDDEN,
    ordinal: i < sampleCount ? i + 1 : i + 1 - sampleCount,
    input,
    expectedOutput: fn(input),
    weight: i < sampleCount ? 0 : 1,
  }));
}

const problems: SeedProblem[] = [
  {
    slug: "sum-two",
    title: "A + B",
    difficulty: 1,
    tags: ["math", "warmup"],
    statementMd:
      "Read two integers `a` and `b` (−10⁹ ≤ a, b ≤ 10⁹) on one line and print their sum.\n\n**Input:** one line, two integers.\n**Output:** one integer.",
    editorialMd: "Read the two values and print `a+b`. This is the I/O warmup.",
    cases: casesFrom(
      (inp) => String(inp.trim().split(/\s+/).map(Number).reduce((a, b) => a + b, 0)),
      ["1 2", "10 -3", "1000000000 1000000000", "-5 -7", "0 0", "123456789 987654321", "-1000000000 -1000000000", "42 58"]
    ),
  },
  {
    slug: "max-of-list",
    title: "Maximum Element",
    difficulty: 1,
    tags: ["arrays", "warmup"],
    statementMd:
      "First line: integer `n` (1 ≤ n ≤ 10⁵). Second line: `n` integers. Print the maximum.",
    editorialMd: "Single pass, track the max. O(n).",
    cases: casesFrom(
      (inp) => {
        const [, nums] = inp.split("\n");
        return String(Math.max(...nums.trim().split(/\s+/).map(Number)));
      },
      [
        "3\n1 5 2", "4\n-1 -9 -3 -2",
        "1\n42",
        "5\n7 7 7 7 7",
        `10\n${Array.from({ length: 10 }, () => ri(-1000, 1000)).join(" ")}`,
        `1000\n${Array.from({ length: 1000 }, () => ri(-1000000, 1000000)).join(" ")}`,
        `100000\n${Array.from({ length: 100000 }, () => ri(-1000000000, 1000000000)).join(" ")}`,
      ]
    ),
  },
  {
    slug: "reverse-string",
    title: "Reverse a String",
    difficulty: 1,
    tags: ["strings", "warmup"],
    statementMd: "Read one line (≤10⁵ characters) and print it reversed.",
    editorialMd: "Language built-ins suffice; watch for trailing newlines.",
    cases: casesFrom(
      (inp) => inp.replace(/\n$/, "").split("").reverse().join(""),
      ["hello", "ab", "racecar", "a", "The quick brown fox", "x".repeat(1000) + "y"]
    ),
  },
  {
    slug: "fizzbuzz-count",
    title: "FizzBuzz Counting",
    difficulty: 2,
    tags: ["math", "implementation"],
    statementMd:
      "Given `n` (1 ≤ n ≤ 10⁹), print three numbers separated by spaces: how many integers in [1,n] are divisible by 3 only, by 5 only, and by both.",
    editorialMd: "Pure arithmetic: ⌊n/3⌋−⌊n/15⌋, ⌊n/5⌋−⌊n/15⌋, ⌊n/15⌋. No loops needed — an O(n) loop TLEs at 10⁹.",
    cases: casesFrom(
      (inp) => {
        const n = BigInt(inp.trim());
        const d3 = n / 3n - n / 15n, d5 = n / 5n - n / 15n, d15 = n / 15n;
        return `${d3} ${d5} ${d15}`;
      },
      ["15", "1", "100", "999999999", "1000000000", "3", "5", "14"]
    ),
  },
  {
    slug: "two-sum-exists",
    title: "Pair With Target Sum",
    difficulty: 2,
    tags: ["two-pointer", "hashing"],
    statementMd:
      "First line: `n` and target `t`. Second line: `n` integers (n ≤ 10⁵). Print `YES` if two distinct elements sum to `t`, else `NO`.",
    editorialMd: "Hash set of seen values, or sort + two pointers. O(n) / O(n log n).",
    cases: casesFrom(
      (inp) => {
        const [first, second] = inp.split("\n");
        const [, t] = first.trim().split(/\s+/).map(Number);
        const nums = second.trim().split(/\s+/).map(Number);
        const seen = new Set<number>();
        for (const x of nums) {
          if (seen.has(t - x)) return "YES";
          seen.add(x);
        }
        return "NO";
      },
      [
        "4 9\n2 7 11 15", "3 10\n1 2 3",
        "2 0\n0 0",
        "5 -8\n-3 -5 1 2 9",
        "6 100\n50 49 51 1 2 3",
        `100000 1999999999\n${Array.from({ length: 99998 }, () => ri(-1000, 1000)).join(" ")} 999999999 1000000000`,
      ]
    ),
  },
  {
    slug: "balanced-brackets",
    title: "Balanced Brackets",
    difficulty: 2,
    tags: ["stack", "strings"],
    statementMd:
      "One line containing only `()[]{}` (length ≤ 10⁵). Print `YES` if balanced, else `NO`.",
    editorialMd: "Classic stack scan; O(n).",
    cases: casesFrom(
      (inp) => {
        const s = inp.trim();
        const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
        const st: string[] = [];
        for (const ch of s) {
          if ("([{".includes(ch)) st.push(ch);
          else if (st.pop() !== pairs[ch]) return "NO";
        }
        return st.length === 0 ? "YES" : "NO";
      },
      ["()", "([)]", "{[()]}", "(", "]", "()[]{}", "((((((((()))))))))", "{[()]}[", "" .padEnd(0) + "()".repeat(50000)]
    ),
  },
  {
    slug: "longest-run",
    title: "Longest Run of Equal Numbers",
    difficulty: 3,
    tags: ["arrays", "sliding-window"],
    statementMd:
      "First line `n` (1 ≤ n ≤ 10⁶). Second line: `n` integers. Print the length of the longest contiguous run of equal values.",
    editorialMd: "Single pass with a run counter. O(n); mind fast input in Python (`sys.stdin`).",
    cases: casesFrom(
      (inp) => {
        const nums = inp.split("\n")[1].trim().split(/\s+/).map(Number);
        let best = 1, cur = 1;
        for (let i = 1; i < nums.length; i++) {
          cur = nums[i] === nums[i - 1] ? cur + 1 : 1;
          if (cur > best) best = cur;
        }
        return String(best);
      },
      [
        "5\n1 1 2 2 2", "3\n3 1 3",
        "1\n9",
        "8\n4 4 4 4 1 1 1 1",
        `1000000\n${Array.from({ length: 1000000 }, (_, i) => (i < 500000 ? 7 : ri(1, 5))).join(" ")}`,
      ]
    ),
  },
  {
    slug: "grid-paths",
    title: "Grid Paths",
    difficulty: 3,
    tags: ["dp", "combinatorics"],
    statementMd:
      "Given `r` and `c` (1 ≤ r,c ≤ 1000), count lattice paths from top-left to bottom-right of an r×c grid moving only right or down, modulo 1 000 000 007.",
    editorialMd: "DP table or C(r+c−2, r−1) with modular inverse. O(rc) DP passes comfortably.",
    cases: casesFrom(
      (inp) => {
        const [r, c] = inp.trim().split(/\s+/).map(Number);
        const MOD = 1000000007n;
        const row = new Array<bigint>(c).fill(1n);
        for (let i = 1; i < r; i++)
          for (let j = 1; j < c; j++) row[j] = (row[j] + row[j - 1]) % MOD;
        return String(row[c - 1]);
      },
      ["2 2", "3 3", "1 1", "1 1000", "10 10", "1000 1000", "999 998"]
    ),
  },
  {
    slug: "dijkstra-lite",
    title: "Cheapest Route",
    difficulty: 4,
    tags: ["graphs", "shortest-path"],
    statementMd:
      "First line: `n m` (nodes ≤ 10⁴, edges ≤ 10⁵). Next `m` lines: `u v w` (1-indexed, undirected, w ≤ 10⁶). Last line: `s t`. Print the cheapest cost from s to t, or `-1` if unreachable.",
    editorialMd: "Dijkstra with a binary heap. O((n+m) log n). Plain BFS fails on weights; Bellman-Ford TLEs at the limits.",
    cases: (() => {
      const solve = (inp: string) => {
        const lines = inp.trim().split("\n");
        const [n, m] = lines[0].split(/\s+/).map(Number);
        const adj: [number, number][][] = Array.from({ length: n + 1 }, () => []);
        for (let i = 1; i <= m; i++) {
          const [u, v, w] = lines[i].split(/\s+/).map(Number);
          adj[u].push([v, w]);
          adj[v].push([u, w]);
        }
        const [s, t] = lines[m + 1].split(/\s+/).map(Number);
        const dist = new Array(n + 1).fill(Infinity);
        dist[s] = 0;
        // simple heap via sorted insertion is fine for seed-side generation
        const pq: [number, number][] = [[0, s]];
        while (pq.length) {
          pq.sort((a, b) => a[0] - b[0]);
          const [d, u] = pq.shift()!;
          if (d > dist[u]) continue;
          for (const [v, w] of adj[u]) {
            if (d + w < dist[v]) {
              dist[v] = d + w;
              pq.push([dist[v], v]);
            }
          }
        }
        return String(dist[t] === Infinity ? -1 : dist[t]);
      };
      const gen = (n: number, m: number): string => {
        const edges: string[] = [];
        for (let i = 2; i <= n; i++) edges.push(`${ri(1, i - 1)} ${i} ${ri(1, 1000000)}`);
        for (let i = n; i <= m; i++) edges.push(`${ri(1, n)} ${ri(1, n)} ${ri(1, 1000000)}`);
        return `${n} ${m}\n${edges.join("\n")}\n1 ${n}`;
      };
      const inputs = [
        "3 3\n1 2 4\n2 3 5\n1 3 10\n1 3",
        "2 1\n1 2 7\n1 2",
        "4 2\n1 2 1\n3 4 1\n1 4",
        "5 6\n1 2 2\n2 3 2\n3 4 2\n4 5 2\n1 5 9\n2 4 3\n1 5",
        gen(100, 300),
        gen(5000, 20000),
      ];
      return casesFrom(solve, inputs);
    })(),
  },
  {
    slug: "coin-change-min",
    title: "Fewest Coins",
    difficulty: 4,
    tags: ["dp"],
    statementMd:
      "First line: `k` (coin kinds ≤ 20) and amount `A` (≤ 10⁵). Second line: `k` distinct coin values. Print the minimum number of coins to make exactly `A`, or `-1`.",
    editorialMd: "Classic unbounded-knapsack DP over amounts, O(k·A). Greedy fails (e.g. coins 1,3,4 for A=6).",
    cases: casesFrom(
      (inp) => {
        const [first, second] = inp.split("\n");
        const [, A] = first.trim().split(/\s+/).map(Number);
        const coins = second.trim().split(/\s+/).map(Number);
        const dp = new Array(A + 1).fill(Infinity);
        dp[0] = 0;
        for (let a = 1; a <= A; a++)
          for (const c of coins) if (c <= a && dp[a - c] + 1 < dp[a]) dp[a] = dp[a - c] + 1;
        return String(dp[A] === Infinity ? -1 : dp[A]);
      },
      ["3 6\n1 3 4", "1 3\n2", "3 11\n1 5 6", "2 100000\n7 13", "4 99991\n2 3 5 7", "3 1\n2 4 6"]
    ),
  },
];

async function main() {
  console.log("Seeding…");

  // Groups
  const groupNames = ["Batch A", "Batch B", "Batch C"];
  const groups = [];
  for (const name of groupNames) {
    groups.push(
      await prisma.group.upsert({ where: { name }, create: { name }, update: {} })
    );
  }

  // Admin
  await prisma.user.upsert({
    where: { email: "admin@demo.local" },
    update: {},
    create: {
      email: "admin@demo.local",
      name: "Demo Admin",
      role: "SUPER_ADMIN",
      hash: await argon2.hash("admin1234"),
    },
  });

  // 30 participants
  const firstNames = ["Aarav","Diya","Ishaan","Meera","Rohan","Sana","Kabir","Anika","Vivaan","Zara","Arjun","Nisha","Dev","Priya","Kian","Tara","Reyansh","Isha","Aditya","Naina","Vihaan","Riya","Ayaan","Sneha","Krish","Pooja","Rudra","Simran","Yash","Avni"];
  for (let i = 0; i < 30; i++) {
    const email = `student${String(i + 1).padStart(2, "0")}@demo.local`;
    const externalId = `2026${String(i + 1).padStart(3, "0")}`;
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: `${firstNames[i]} ${String.fromCharCode(65 + (i % 26))}.`,
        externalId,
        groupId: groups[i % 3].id,
        hash: await argon2.hash(externalId),
      },
    });
  }

  // Problems
  const created: { id: string; slug: string }[] = [];
  for (const p of problems) {
    const existing = await prisma.problem.findUnique({ where: { slug: p.slug } });
    if (existing) {
      created.push({ id: existing.id, slug: p.slug });
      continue;
    }
    const rec = await prisma.problem.create({
      data: {
        slug: p.slug,
        title: p.title,
        statementMd: p.statementMd,
        difficulty: p.difficulty,
        tags: p.tags,
        editorialMd: p.editorialMd,
        editorialReleased: true,
        testCases: { create: p.cases },
      },
    });
    created.push({ id: rec.id, slug: p.slug });
  }
  console.log(`Problems: ${created.length}`);

  // Past contest (ended last weekend) + scheduled contest (next Sunday 10:00 IST)
  const now = new Date();
  const pastStart = new Date(now.getTime() - 7 * 86400000);
  const pastEnd = new Date(pastStart.getTime() + 3 * 3600000);
  const nextSunday = new Date(now);
  nextSunday.setUTCDate(now.getUTCDate() + ((7 - now.getUTCDay()) % 7 || 7));
  nextSunday.setUTCHours(4, 30, 0, 0); // 10:00 IST
  const nextEnd = new Date(nextSunday.getTime() + 3 * 3600000);

  const bySlug = Object.fromEntries(created.map((c) => [c.slug, c.id]));

  const pastExists = await prisma.contest.findFirst({ where: { title: "Demo Contest #0 (past)" } });
  if (!pastExists) {
    await prisma.contest.create({
      data: {
        title: "Demo Contest #0 (past)",
        description: "Already-finished demo contest so the archive and leaderboard have data.",
        startsAt: pastStart,
        endsAt: pastEnd,
        scoringMode: "PARTIAL",
        problems: {
          create: [
            { problemId: bySlug["sum-two"], points: 100, order: 1 },
            { problemId: bySlug["two-sum-exists"], points: 100, order: 2 },
            { problemId: bySlug["grid-paths"], points: 100, order: 3 },
          ],
        },
      },
    });
  }

  const schedExists = await prisma.contest.findFirst({ where: { title: "Weekly Challenge #1" } });
  if (!schedExists) {
    await prisma.contest.create({
      data: {
        title: "Weekly Challenge #1",
        description: "4 problems, 3 hours. 2 partial-scored, 2 binary — good luck!",
        startsAt: nextSunday,
        endsAt: nextEnd,
        scoringMode: "PARTIAL",
        problems: {
          create: [
            { problemId: bySlug["max-of-list"], points: 100, order: 1 },
            { problemId: bySlug["fizzbuzz-count"], points: 100, order: 2 },
            { problemId: bySlug["dijkstra-lite"], points: 100, order: 3 },
            { problemId: bySlug["coin-change-min"], points: 100, order: 4 },
          ],
        },
      },
    });
  }

  await prisma.instanceSetting.upsert({
    where: { key: "signup_mode" },
    update: {},
    create: { key: "signup_mode", value: "open" },
  });
  await prisma.instanceSetting.upsert({
    where: { key: "instance_name" },
    update: {},
    create: { key: "instance_name", value: "Contest Platform (demo)" },
  });

  console.log("Seed complete. Admin: admin@demo.local / admin1234");
}

main().finally(() => prisma.$disconnect());
