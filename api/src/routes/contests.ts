import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { buildLeaderboard } from "../leaderboard/service.js";

export const contestsRouter = Router();

async function userCanSeeContest(userId: string, groupScope: string[]): Promise<boolean> {
  if (groupScope.length === 0) return true;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { groupId: true } });
  return !!user?.groupId && groupScope.includes(user.groupId);
}

contestsRouter.get("/", requireAuth, async (req, res) => {
  const contests = await prisma.contest.findMany({
    where: { visible: true },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      endsAt: true,
      scoringMode: true,
      groupScope: true,
      _count: { select: { problems: true } },
    },
  });
  const visible = [];
  for (const c of contests) {
    if (await userCanSeeContest(req.user!.id, c.groupScope)) {
      const { groupScope, ...rest } = c;
      visible.push(rest);
    }
  }
  res.json(visible);
});

/** Contest lobby. Problems stay hidden until the clock starts (spec 5.3). */
contestsRouter.get("/:id", requireAuth, async (req, res) => {
  const contest = await prisma.contest.findUnique({
    where: { id: req.params.id },
    include: {
      problems: {
        orderBy: { order: "asc" },
        include: {
          problem: { select: { id: true, slug: true, title: true, difficulty: true, tags: true } },
        },
      },
    },
  });
  if (!contest || !contest.visible) return res.status(404).json({ error: "not found" });
  if (!(await userCanSeeContest(req.user!.id, contest.groupScope))) {
    return res.status(403).json({ error: "this contest is restricted to specific groups" });
  }

  const now = new Date();
  const started = now >= contest.startsAt;
  const ended = now >= contest.endsAt;

  res.json({
    id: contest.id,
    title: contest.title,
    description: contest.description,
    startsAt: contest.startsAt,
    endsAt: contest.endsAt,
    scoringMode: contest.scoringMode,
    wrongPenaltyMin: contest.wrongPenaltyMin,
    status: ended ? "ended" : started ? "running" : "upcoming",
    problems: started
      ? contest.problems.map((cp) => ({ ...cp.problem, points: cp.points, order: cp.order }))
      : [], // lobby countdown only
  });
});

contestsRouter.get("/:id/leaderboard", requireAuth, async (req, res) => {
  const payload = await buildLeaderboard(req.params.id);
  if (!payload) return res.status(404).json({ error: "not found" });
  res.json(payload);
});
