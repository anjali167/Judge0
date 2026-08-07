import { Router } from "express";
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
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  scoringMode: z.enum(["PARTIAL", "BINARY"]).default("PARTIAL"),
  wrongPenaltyMin: z.number().int().min(0).default(10),
  groupScope: z.array(z.string()).default([]),
  problems: z.array(
    z.object({ problemId: z.string(), points: z.number().int().min(0).default(100), order: z.number().int().default(0) })
  ),
});

adminRouter.post("/contests", async (req, res) => {
  const parsed = contestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const { problems, startsAt, endsAt, ...data } = parsed.data;
  if (new Date(endsAt) <= new Date(startsAt)) {
    return res.status(400).json({ error: "endsAt must be after startsAt" });
  }

  const problemRecords = await prisma.problem.findMany({
    where: { id: { in: problems.map((p) => p.problemId) } },
    select: { id: true, version: true },
  });
  const versionMap = new Map(problemRecords.map((p) => [p.id, p.version]));

  const contest = await prisma.contest.create({
    data: {
      ...data,
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
