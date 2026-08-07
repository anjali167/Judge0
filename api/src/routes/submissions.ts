import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db.js";
import { redis } from "../redis.js";
import { requireAuth } from "../auth.js";
import { judgeQueue, queueDepth, queuePosition } from "../judge/queue.js";
import { LANGUAGES } from "../judge/judge0.js";
import { config } from "../config.js";

export const submissionsRouter = Router();

const submitLimiter = rateLimit({ windowMs: 60_000, limit: 10 });

const submitSchema = z.object({
  problemId: z.string(),
  contestId: z.string().optional(),
  language: z.string().refine((l) => l in LANGUAGES, "unsupported language"),
  source: z.string().min(1).max(256 * 1024),
  mode: z.enum(["run", "submit"]),
});

submissionsRouter.post("/", requireAuth, submitLimiter, async (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid payload" });
  }
  const { problemId, contestId, language, source, mode } = parsed.data;
  const userId = req.user!.id;
  const isRun = mode === "run";

  // Rate limiting per spec 5.2: cooldown + one in-flight + global cap
  if (!isRun) {
    const cooldownKey = `cooldown:${userId}`;
    if (await redis.get(cooldownKey)) {
      return res.status(429).json({ error: `wait ${config.submitCooldownSec}s between submissions` });
    }
    const inFlight = await prisma.submission.count({
      where: { userId, verdict: { in: ["PENDING", "RUNNING"] } },
    });
    if (inFlight > 0) {
      return res.status(429).json({ error: "you already have a submission being judged" });
    }
    if ((await queueDepth()) >= config.queueCap) {
      return res.status(503).json({ error: "judge queue is full, try again shortly" });
    }
  }

  const problem = await prisma.problem.findUnique({ where: { id: problemId } });
  if (!problem) return res.status(404).json({ error: "problem not found" });

  let effectiveContestId: string | null = null;
  if (contestId) {
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      include: { problems: { where: { problemId } } },
    });
    const now = new Date();
    if (!contest || contest.problems.length === 0) {
      return res.status(400).json({ error: "problem is not part of this contest" });
    }
    if (now < contest.startsAt) return res.status(403).json({ error: "contest has not started" });
    // After the end: allow, but as practice (uncounted) — simplest late policy for MVP
    effectiveContestId = now <= contest.endsAt ? contestId : null;
  }

  const submission = await prisma.submission.create({
    data: {
      userId,
      problemId,
      contestId: isRun ? null : effectiveContestId,
      language,
      source,
      verdict: "PENDING",
    },
  });

  await judgeQueue.add("judge", { submissionId: submission.id, sampleOnly: isRun });
  if (!isRun) {
    await redis.set(`cooldown:${userId}`, "1", "EX", config.submitCooldownSec);
  }

  res.status(202).json({
    id: submission.id,
    position: await queuePosition(submission.id),
  });
});

/** Submission detail — own submissions only (organizers can see all). */
submissionsRouter.get("/:id", requireAuth, async (req, res) => {
  const submission = await prisma.submission.findUnique({
    where: { id: req.params.id },
    include: {
      results: { include: { testCase: { select: { kind: true, ordinal: true } } } },
      problem: { select: { slug: true, title: true } },
    },
  });
  if (!submission) return res.status(404).json({ error: "not found" });
  const isOwner = submission.userId === req.user!.id;
  const isOrganizer = req.user!.role !== "PARTICIPANT";
  if (!isOwner && !isOrganizer) return res.status(403).json({ error: "forbidden" });

  res.json({
    id: submission.id,
    problem: submission.problem,
    language: submission.language,
    source: isOwner || isOrganizer ? submission.source : undefined,
    verdict: submission.verdict,
    score: submission.score,
    maxScore: submission.maxScore,
    execTimeMs: submission.execTimeMs,
    memoryKb: submission.memoryKb,
    compileOutput: submission.compileOutput, // only set for CE; safe to show
    createdAt: submission.createdAt,
    position:
      submission.verdict === "PENDING" ? await queuePosition(submission.id) : 0,
    // Per-case verdicts: verdict + time only. Hidden case IO never leaves the server.
    results: submission.results
      .sort((a, b) =>
        a.testCase.kind === b.testCase.kind
          ? a.testCase.ordinal - b.testCase.ordinal
          : a.testCase.kind === "SAMPLE"
            ? -1
            : 1
      )
      .map((r) => ({
        kind: r.testCase.kind,
        ordinal: r.testCase.ordinal,
        verdict: r.verdict,
        timeMs: r.timeMs,
      })),
  });
});

/** My submission history for a problem (spec 5.2). */
submissionsRouter.get("/", requireAuth, async (req, res) => {
  const problemId = typeof req.query.problemId === "string" ? req.query.problemId : undefined;
  const submissions = await prisma.submission.findMany({
    where: { userId: req.user!.id, ...(problemId ? { problemId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      problemId: true,
      language: true,
      verdict: true,
      score: true,
      maxScore: true,
      execTimeMs: true,
      createdAt: true,
      problem: { select: { slug: true, title: true } },
    },
  });
  res.json(submissions);
});
