/**
 * Unauthenticated endpoints: instance info, active announcements, and the
 * public read-only leaderboard (spec 5.5) — shareable/projectable via token URL.
 */
import { Router } from "express";
import { prisma } from "../db.js";
import { buildLeaderboard } from "../leaderboard/service.js";
import { getPublicInstanceInfo } from "../settings.js";

export const publicRouter = Router();

publicRouter.get("/instance", async (_req, res) => {
  res.json(await getPublicInstanceInfo());
});

publicRouter.get("/announcements", async (_req, res) => {
  res.json(
    await prisma.announcement.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, body: true, createdAt: true },
    })
  );
});

publicRouter.get("/public/contests/:token/leaderboard", async (req, res) => {
  const contest = await prisma.contest.findUnique({
    where: { publicToken: req.params.token },
    include: {
      problems: {
        orderBy: { order: "asc" },
        include: { problem: { select: { id: true, title: true } } },
      },
      _count: { select: { quizQuestions: true } },
    },
  });
  if (!contest || !contest.visible) return res.status(404).json({ error: "not found" });

  const payload = await buildLeaderboard(contest.id);
  if (!payload) return res.status(404).json({ error: "not found" });

  res.json({
    contest: {
      title: contest.title,
      startsAt: contest.startsAt,
      endsAt: contest.endsAt,
      hasQuiz: contest._count.quizQuestions > 0,
      problems: contest.problems.map((cp) => ({
        id: cp.problem.id,
        title: cp.problem.title,
        order: cp.order,
      })),
    },
    leaderboard: payload,
  });
});
