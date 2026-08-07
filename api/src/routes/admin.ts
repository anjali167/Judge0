import { Router } from "express";
import { randomBytes } from "node:crypto";
import { parse } from "csv-parse/sync";
import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { judgeHealth } from "../judge/judge0.js";
import { queueDepth } from "../judge/queue.js";
import { invalidateLeaderboard } from "../leaderboard/service.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("ORGANIZER"));

async function audit(actorId: string, action: string, target?: string, detail?: unknown) {
  await prisma.auditLog.create({
    data: { actorId, action, target, detail: detail as object | undefined },
  });
}

/* ---------- Users & groups ---------- */

/**
 * CSV bulk import (spec 5.7): columns external_id,name,email,group
 * Creates missing groups; default password = external_id (forced change is a Phase 2 item;
 * documented in the runbook). Returns per-row results.
 */
adminRouter.post("/users/import", async (req, res) => {
  const csv = typeof req.body?.csv === "string" ? req.body.csv : null;
  if (!csv) return res.status(400).json({ error: "body must be { csv: string }" });

  let records: Record<string, string>[];
  try {
    records = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ error: `CSV parse error: ${(e as Error).message}` });
  }

  const results: { email: string; status: string }[] = [];
  for (const row of records) {
    const email = row.email?.toLowerCase();
    if (!email || !row.name) {
      results.push({ email: email ?? "?", status: "skipped: missing name/email" });
      continue;
    }
    let groupId: string | undefined;
    if (row.group) {
      const group = await prisma.group.upsert({
        where: { name: row.group },
        create: { name: row.group },
        update: {},
      });
      groupId = group.id;
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.user.update({
        where: { email },
        data: { name: row.name, externalId: row.external_id || existing.externalId, groupId },
      });
      results.push({ email, status: "updated" });
    } else {
      const hash = await argon2.hash(row.external_id || email);
      await prisma.user.create({
        data: { email, name: row.name, externalId: row.external_id || null, groupId, hash },
      });
      results.push({ email, status: "created" });
    }
  }
  await audit(req.user!.id, "users.import", undefined, { count: records.length });
  res.json({ results });
});

adminRouter.get("/users", async (_req, res) => {
  res.json(
    await prisma.user.findMany({
      select: {
        id: true, externalId: true, name: true, email: true, role: true,
        group: { select: { id: true, name: true } }, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    })
  );
});

adminRouter.get("/groups", async (_req, res) => {
  res.json(await prisma.group.findMany({ include: { _count: { select: { users: true } } } }));
});

adminRouter.post("/groups", async (req, res) => {
  const parsed = z.object({ name: z.string().min(1), description: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid payload" });
  const group = await prisma.group.create({ data: parsed.data });
  await audit(req.user!.id, "group.create", group.id);
  res.status(201).json(group);
});

/* ---------- Problems ---------- */

const testCaseSchema = z.object({
  kind: z.enum(["SAMPLE", "HIDDEN"]),
  ordinal: z.number().int().min(1),
  input: z.string(),
  expectedOutput: z.string(),
  weight: z.number().int().min(0).default(1),
});

const problemSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  statementMd: z.string().min(1),
  difficulty: z.number().int().min(1).max(5).default(1),
  tags: z.array(z.string()).default([]),
  timeLimit: z.number().positive().max(10).default(1),
  memLimit: z.number().int().min(16384).max(1048576).default(262144),
  editorialMd: z.string().optional(),
  testCases: z.array(testCaseSchema).min(1),
});

adminRouter.post("/problems", async (req, res) => {
  const parsed = problemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const { testCases, ...data } = parsed.data;
  const problem = await prisma.problem.create({
    data: { ...data, authorId: req.user!.id, testCases: { create: testCases } },
  });
  await audit(req.user!.id, "problem.create", problem.id, { slug: problem.slug });
  res.status(201).json(problem);
});

/**
 * Problem update bumps `version` (spec 5.1: editing after contest use must not
 * silently rewrite past results — past submissions keep their stored scores;
 * contest_problems snapshot the version they ran against).
 */
adminRouter.put("/problems/:id", async (req, res) => {
  const parsed = problemSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const { testCases, ...data } = parsed.data;

  const problem = await prisma.$transaction(async (tx) => {
    const updated = await tx.problem.update({
      where: { id: req.params.id },
      data: { ...data, version: { increment: 1 } },
    });
    if (testCases) {
      await tx.testCase.deleteMany({ where: { problemId: updated.id } });
      await tx.testCase.createMany({
        data: testCases.map((tc) => ({ ...tc, problemId: updated.id })),
      });
    }
    return updated;
  });
  await audit(req.user!.id, "problem.update", problem.id, { version: problem.version });
  res.json(problem);
});

adminRouter.post("/problems/:id/release-editorial", async (req, res) => {
  const problem = await prisma.problem.update({
    where: { id: req.params.id },
    data: { editorialReleased: true },
  });
  await audit(req.user!.id, "problem.release_editorial", problem.id);
  res.json({ ok: true });
});

adminRouter.get("/problems", async (_req, res) => {
  res.json(
    await prisma.problem.findMany({
      select: {
        id: true, slug: true, title: true, difficulty: true, tags: true, version: true,
        archived: true, _count: { select: { testCases: true, submissions: true } },
      },
      orderBy: { createdAt: "desc" },
    })
  );
});

/* ---------- Contests ---------- */

const contestSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["CODE", "QUIZ", "MIXED"]).default("CODE"),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  scoringMode: z.enum(["PARTIAL", "BINARY"]).default("PARTIAL"),
  wrongPenaltyMin: z.number().int().min(0).default(10),
  freezeMin: z.number().int().min(0).default(0),
  makePublic: z.boolean().default(false),
  groupScope: z.array(z.string()).default([]),
  problems: z.array(
    z.object({ problemId: z.string(), points: z.number().int().min(0).default(100), order: z.number().int().default(0) })
  ),
});

adminRouter.post("/contests", async (req, res) => {
  const parsed = contestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const { problems, startsAt, endsAt, makePublic, ...data } = parsed.data;
  if (new Date(endsAt) <= new Date(startsAt)) {
    return res.status(400).json({ error: "endsAt must be after startsAt" });
  }
  const publicToken = makePublic ? randomBytes(12).toString("base64url") : null;

  const problemRecords = await prisma.problem.findMany({
    where: { id: { in: problems.map((p) => p.problemId) } },
    select: { id: true, version: true },
  });
  const versionMap = new Map(problemRecords.map((p) => [p.id, p.version]));

  const contest = await prisma.contest.create({
    data: {
      ...data,
      publicToken,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      problems: {
        create: problems.map((p) => ({
          problemId: p.problemId,
          points: p.points,
          order: p.order,
          problemVersion: versionMap.get(p.problemId) ?? 1,
        })),
      },
    },
  });
  await audit(req.user!.id, "contest.create", contest.id, { title: contest.title });
  res.status(201).json(contest);
});

adminRouter.delete("/contests/:id", async (req, res) => {
  await prisma.contest.delete({ where: { id: req.params.id } });
  await invalidateLeaderboard(req.params.id);
  await audit(req.user!.id, "contest.delete", req.params.id);
  res.json({ ok: true });
});

/* ---------- Quiz questions ---------- */

const quizQuestionSchema = z.object({
  ordinal: z.number().int().min(1),
  kind: z.enum(["SINGLE", "MULTI", "NUMERIC", "CODE_OUTPUT"]),
  promptMd: z.string().min(1),
  codeMd: z.string().optional(),
  options: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
  answer: z.union([
    z.array(z.string()),
    z.object({ value: z.number(), tolerance: z.number().min(0) }),
  ]),
  marks: z.number().int().min(0).default(4),
  negativeMarks: z.number().int().min(0).default(0),
});

/** Replace a contest's quiz question set wholesale (simplest authoring model). */
adminRouter.put("/contests/:id/quiz", async (req, res) => {
  const parsed = z.array(quizQuestionSchema).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
  if (!contest) return res.status(404).json({ error: "contest not found" });

  for (const q of parsed.data) {
    if (q.kind !== "NUMERIC") {
      const ids = new Set(q.options.map((o) => o.id));
      const ans = q.answer as string[];
      if (!Array.isArray(ans) || ans.length === 0 || !ans.every((a) => ids.has(a))) {
        return res.status(400).json({ error: `question ${q.ordinal}: answer ids must reference option ids` });
      }
      if (q.kind !== "MULTI" && ans.length !== 1) {
        return res.status(400).json({ error: `question ${q.ordinal}: exactly one correct option required` });
      }
    }
  }

  await prisma.$transaction([
    prisma.quizQuestion.deleteMany({ where: { contestId: contest.id } }),
    prisma.quizQuestion.createMany({
      data: parsed.data.map((q) => ({ ...q, contestId: contest.id })),
    }),
  ]);
  await audit(req.user!.id, "quiz.replace", contest.id, { count: parsed.data.length });
  res.json({ ok: true, count: parsed.data.length });
});

adminRouter.get("/contests/:id/quiz", async (req, res) => {
  res.json(
    await prisma.quizQuestion.findMany({
      where: { contestId: req.params.id },
      orderBy: { ordinal: "asc" },
    })
  );
});

/* ---------- Ratings ---------- */

adminRouter.post("/contests/:id/finalize-ratings", async (req, res) => {
  const { finalizeContestRatings } = await import("../rating/service.js");
  const done = await finalizeContestRatings(req.params.id);
  await audit(req.user!.id, "contest.finalize_ratings", req.params.id, { done });
  res.json({ finalized: done });
});

/* ---------- Announcements ---------- */

adminRouter.post("/announcements", async (req, res) => {
  const parsed = z
    .object({ title: z.string().min(1), body: z.string().min(1), active: z.boolean().default(true) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid payload" });
  const a = await prisma.announcement.create({ data: parsed.data });
  await audit(req.user!.id, "announcement.create", a.id);
  res.status(201).json(a);
});

adminRouter.put("/announcements/:id", async (req, res) => {
  const parsed = z
    .object({ title: z.string().min(1).optional(), body: z.string().min(1).optional(), active: z.boolean().optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid payload" });
  const a = await prisma.announcement.update({ where: { id: req.params.id }, data: parsed.data });
  await audit(req.user!.id, "announcement.update", a.id);
  res.json(a);
});

adminRouter.get("/announcements", async (_req, res) => {
  res.json(await prisma.announcement.findMany({ orderBy: { createdAt: "desc" } }));
});

/* ---------- Instance settings ---------- */

adminRouter.get("/settings", async (_req, res) => {
  const rows = await prisma.instanceSetting.findMany();
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

adminRouter.put("/settings", requireRole("SUPER_ADMIN"), async (req, res) => {
  const parsed = z.record(z.unknown()).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid payload" });
  const ALLOWED = new Set(["instance_name", "signup_mode", "modules", "most_improved_k"]);
  const { setSetting } = await import("../settings.js");
  for (const [key, value] of Object.entries(parsed.data)) {
    if (!ALLOWED.has(key)) return res.status(400).json({ error: `unknown setting: ${key}` });
    await setSetting(key, value);
  }
  await audit(req.user!.id, "settings.update", undefined, parsed.data);
  res.json({ ok: true });
});

/* ---------- Plagiarism (spec 5.6: flags are review signals, never auto-punishment) ---------- */

adminRouter.post("/contests/:id/plagiarism-scan", async (req, res) => {
  const threshold = typeof req.body?.threshold === "number" ? req.body.threshold : undefined;
  const { scanContest } = await import("../plagiarism/service.js");
  const result = await scanContest(req.params.id, threshold);
  await audit(req.user!.id, "plagiarism.scan", req.params.id, result);
  res.json(result);
});

adminRouter.get("/contests/:id/plagiarism-flags", async (req, res) => {
  const flags = await prisma.plagiarismFlag.findMany({
    where: { contestId: req.params.id },
    orderBy: [{ status: "asc" }, { similarity: "desc" }],
  });
  const userIds = [...new Set(flags.flatMap((f) => [f.userA, f.userB]))];
  const problemIds = [...new Set(flags.map((f) => f.problemId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, externalId: true },
  });
  const problems = await prisma.problem.findMany({
    where: { id: { in: problemIds } },
    select: { id: true, title: true, slug: true },
  });
  const uMap = new Map(users.map((u) => [u.id, u]));
  const pMap = new Map(problems.map((p) => [p.id, p]));
  res.json(
    flags.map((f) => ({
      ...f,
      userA: uMap.get(f.userA) ?? { id: f.userA },
      userB: uMap.get(f.userB) ?? { id: f.userB },
      problem: pMap.get(f.problemId) ?? { id: f.problemId },
    }))
  );
});

/** Review a flag: DISMISSED or CONFIRMED, with an optional note. */
adminRouter.put("/plagiarism-flags/:id", async (req, res) => {
  const parsed = z
    .object({ status: z.enum(["PENDING", "DISMISSED", "CONFIRMED"]), reviewNote: z.string().max(2000).optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid payload" });
  const flag = await prisma.plagiarismFlag.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  await audit(req.user!.id, "plagiarism.review", flag.id, parsed.data);
  res.json(flag);
});

/** Side-by-side sources for a flag (organizer only — full source view). */
adminRouter.get("/plagiarism-flags/:id/sources", async (req, res) => {
  const flag = await prisma.plagiarismFlag.findUnique({ where: { id: req.params.id } });
  if (!flag) return res.status(404).json({ error: "not found" });
  const [a, b] = await Promise.all([
    prisma.submission.findUnique({
      where: { id: flag.submissionA },
      select: { id: true, source: true, language: true, createdAt: true, user: { select: { name: true } } },
    }),
    prisma.submission.findUnique({
      where: { id: flag.submissionB },
      select: { id: true, source: true, language: true, createdAt: true, user: { select: { name: true } } },
    }),
  ]);
  res.json({ flag, a, b });
});

/* ---------- Telemetry summary (spec 5.6: signals, not blocks) ---------- */

adminRouter.get("/contests/:id/telemetry", async (req, res) => {
  const events = await prisma.telemetryEvent.groupBy({
    by: ["userId", "kind"],
    where: { contestId: req.params.id },
    _count: true,
  });
  const userIds = [...new Set(events.map((e) => e.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, externalId: true },
  });
  const uMap = new Map(users.map((u) => [u.id, u]));
  const byUser: Record<string, { user: unknown; TAB_HIDDEN: number; TAB_VISIBLE: number; PASTE: number }> = {};
  for (const e of events) {
    byUser[e.userId] ??= { user: uMap.get(e.userId), TAB_HIDDEN: 0, TAB_VISIBLE: 0, PASTE: 0 };
    byUser[e.userId][e.kind] = e._count;
  }
  res.json(Object.values(byUser).sort((x, y) => y.TAB_HIDDEN + y.PASTE - (x.TAB_HIDDEN + x.PASTE)));
});

/* ---------- Judge health & exports ---------- */

adminRouter.get("/judge/health", async (_req, res) => {
  res.json({ judge0: await judgeHealth(), queueDepth: await queueDepth() });
});

/** Per-contest results CSV (spec 5.7). */
adminRouter.get("/contests/:id/export.csv", async (req, res) => {
  const { buildLeaderboard } = await import("../leaderboard/service.js");
  await invalidateLeaderboard(req.params.id);
  const payload = await buildLeaderboard(req.params.id);
  if (!payload) return res.status(404).json({ error: "not found" });

  const header = "rank,external_id,name,group,total_score,penalty_min";
  const lines = payload.rows.map((r) =>
    [r.rank, r.externalId ?? "", JSON.stringify(r.name), r.groupName ?? "", r.totalScore, r.penaltyMin].join(",")
  );
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=contest-${req.params.id}.csv`);
  res.send([header, ...lines].join("\n"));
});

/**
 * Cross-contest participant report (spec 5.7): rating trend, solve counts by
 * difficulty, per-contest ranks — one row per participant, CSV.
 */
adminRouter.get("/reports/participants.csv", async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { role: "PARTICIPANT" },
    select: {
      id: true,
      externalId: true,
      name: true,
      email: true,
      group: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  const solvedByUser = await prisma.submission.groupBy({
    by: ["userId", "problemId"],
    where: { verdict: "AC" },
  });
  const solvedProblems = await prisma.problem.findMany({
    select: { id: true, difficulty: true },
  });
  const diffMap = new Map(solvedProblems.map((p) => [p.id, p.difficulty]));

  const ratings = await prisma.rating.findMany({
    orderBy: { createdAt: "asc" },
    select: { userId: true, ratingAfter: true, rank: true, performance: true },
  });

  const header =
    "external_id,name,email,group,contests,current_rating,best_rank,avg_performance,solved_total,solved_easy_1_2,solved_medium_3,solved_hard_4_5";
  const lines = users.map((u) => {
    const mine = ratings.filter((r) => r.userId === u.id);
    const solved = solvedByUser.filter((s) => s.userId === u.id);
    const byDiff = (lo: number, hi: number) =>
      solved.filter((s) => {
        const d = diffMap.get(s.problemId) ?? 0;
        return d >= lo && d <= hi;
      }).length;
    return [
      u.externalId ?? "",
      JSON.stringify(u.name),
      u.email,
      u.group?.name ?? "",
      mine.length,
      mine.length ? mine[mine.length - 1].ratingAfter : "",
      mine.length ? Math.min(...mine.map((r) => r.rank)) : "",
      mine.length ? Math.round(mine.reduce((s, r) => s + r.performance, 0) / mine.length) : "",
      solved.length,
      byDiff(1, 2),
      byDiff(3, 3),
      byDiff(4, 5),
    ].join(",");
  });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=participants.csv");
  res.send([header, ...lines].join("\n"));
});
