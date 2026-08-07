import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { gradeAttempt, seededShuffle, type QuizQuestionSpec } from "../quiz/grade.js";
import { invalidateLeaderboard } from "../leaderboard/service.js";
import { redis } from "../redis.js";
import { LEADERBOARD_CHANNEL } from "../judge/worker.js";
import { getModules } from "../settings.js";

export const quizRouter = Router();

/**
 * Quiz paper for the current user: questions + options in per-user randomized
 * order (deterministic across reloads). Correct answers never serialized.
 */
quizRouter.get("/contests/:id/quiz", requireAuth, async (req, res) => {
  if (!(await getModules()).quiz) return res.status(404).json({ error: "quiz module disabled" });
  const contest = await prisma.contest.findUnique({
    where: { id: req.params.id },
    include: { quizQuestions: { orderBy: { ordinal: "asc" } } },
  });
  if (!contest || contest.quizQuestions.length === 0) {
    return res.status(404).json({ error: "no quiz in this contest" });
  }
  const now = new Date();
  if (now < contest.startsAt) return res.status(403).json({ error: "contest has not started" });

  const attempt = await prisma.quizAttempt.findUnique({
    where: { userId_contestId: { userId: req.user!.id, contestId: contest.id } },
  });

  const seed = `${req.user!.id}|${contest.id}`;
  const questions = seededShuffle(contest.quizQuestions, seed).map((q) => ({
    id: q.id,
    kind: q.kind,
    promptMd: q.promptMd,
    codeMd: q.codeMd,
    marks: q.marks,
    negativeMarks: q.negativeMarks,
    options:
      q.kind === "NUMERIC"
        ? []
        : seededShuffle(q.options as { id: string; text: string }[], `${seed}|${q.id}`),
  }));

  res.json({
    contestId: contest.id,
    endsAt: contest.endsAt,
    submitted: !!attempt,
    ...(attempt
      ? { score: attempt.score, maxScore: attempt.maxScore, breakdown: attempt.breakdown }
      : {}),
    questions,
  });
});

const submitSchema = z.object({
  answers: z.record(z.union([z.array(z.string()), z.number(), z.string()])),
});

/** One attempt per participant; graded server-side; feeds the leaderboard. */
quizRouter.post("/contests/:id/quiz/submit", requireAuth, async (req, res) => {
  if (!(await getModules()).quiz) return res.status(404).json({ error: "quiz module disabled" });
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid payload" });

  const contest = await prisma.contest.findUnique({
    where: { id: req.params.id },
    include: { quizQuestions: true },
  });
  if (!contest || contest.quizQuestions.length === 0) {
    return res.status(404).json({ error: "no quiz in this contest" });
  }
  const now = new Date();
  if (now < contest.startsAt) return res.status(403).json({ error: "contest has not started" });
  if (now > contest.endsAt) return res.status(403).json({ error: "contest has ended" });

  const existing = await prisma.quizAttempt.findUnique({
    where: { userId_contestId: { userId: req.user!.id, contestId: contest.id } },
  });
  if (existing) return res.status(409).json({ error: "quiz already submitted" });

  const specs: QuizQuestionSpec[] = contest.quizQuestions.map((q) => ({
    id: q.id,
    kind: q.kind,
    marks: q.marks,
    negativeMarks: q.negativeMarks,
    answer: q.answer as QuizQuestionSpec["answer"],
  }));
  const normalized: Record<string, string[] | number> = {};
  for (const [k, v] of Object.entries(parsed.data.answers)) {
    normalized[k] = typeof v === "string" ? Number(v) : v;
  }
  const result = gradeAttempt(specs, normalized);

  await prisma.quizAttempt.create({
    data: {
      userId: req.user!.id,
      contestId: contest.id,
      answers: normalized,
      score: result.score,
      maxScore: result.maxScore,
      breakdown: JSON.parse(JSON.stringify(result.breakdown)),
    },
  });

  await invalidateLeaderboard(contest.id);
  await redis.publish(LEADERBOARD_CHANNEL, JSON.stringify({ contestId: contest.id }));

  res.status(201).json({ score: result.score, maxScore: result.maxScore, breakdown: result.breakdown });
});
