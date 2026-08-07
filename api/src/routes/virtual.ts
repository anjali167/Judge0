/**
 * Virtual participation (spec 5.3): attempt a past contest asynchronously on an
 * individual timer of the same duration. Unrated; submissions are tagged
 * virtual and excluded from the official leaderboard, ratings and plagiarism.
 */
import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { buildLeaderboard } from "../leaderboard/service.js";
import { computeStandings, type StandingSubmission } from "../leaderboard/standings.js";

export const virtualRouter = Router();

export async function activeVirtual(userId: string, contestId: string) {
  const vp = await prisma.virtualParticipation.findUnique({
    where: { userId_contestId: { userId, contestId } },
  });
  if (!vp) return null;
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) return null;
  const durationMs = contest.endsAt.getTime() - contest.startsAt.getTime();
  const virtualEndsAt = new Date(vp.startedAt.getTime() + durationMs);
  return { ...vp, virtualEndsAt, running: new Date() < virtualEndsAt };
}

virtualRouter.post("/contests/:id/virtual/start", requireAuth, async (req, res) => {
  const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
  if (!contest) return res.status(404).json({ error: "not found" });
  if (new Date() < contest.endsAt) {
    return res.status(400).json({ error: "virtual participation opens after the contest ends" });
  }
  const official = await prisma.submission.findFirst({
    where: { contestId: contest.id, userId: req.user!.id, virtual: false },
  });
  if (official) {
    return res.status(400).json({ error: "you competed in this contest — virtual attempt not available" });
  }
  const existing = await prisma.virtualParticipation.findUnique({
    where: { userId_contestId: { userId: req.user!.id, contestId: contest.id } },
  });
  if (existing) return res.status(409).json({ error: "virtual attempt already started" });

  const vp = await prisma.virtualParticipation.create({
    data: { userId: req.user!.id, contestId: contest.id },
  });
  const durationMs = contest.endsAt.getTime() - contest.startsAt.getTime();
  res.status(201).json({
    startedAt: vp.startedAt,
    virtualEndsAt: new Date(vp.startedAt.getTime() + durationMs),
  });
});

virtualRouter.get("/contests/:id/virtual", requireAuth, async (req, res) => {
  const vp = await activeVirtual(req.user!.id, req.params.id);
  res.json(vp ? { started: true, startedAt: vp.startedAt, virtualEndsAt: vp.virtualEndsAt, running: vp.running } : { started: false });
});

/**
 * Would-be standing: the user's virtual result merged against the final
 * official board (times measured from their individual start).
 */
virtualRouter.get("/contests/:id/virtual/standing", requireAuth, async (req, res) => {
  const vp = await activeVirtual(req.user!.id, req.params.id);
  if (!vp) return res.status(404).json({ error: "no virtual attempt" });
  const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
  if (!contest) return res.status(404).json({ error: "not found" });

  const official = await buildLeaderboard(contest.id, { ignoreFreeze: true });
  const mySubs = await prisma.submission.findMany({
    where: {
      contestId: contest.id,
      userId: req.user!.id,
      virtual: true,
      verdict: { notIn: ["PENDING", "RUNNING"] },
    },
    select: { userId: true, problemId: true, score: true, maxScore: true, createdAt: true, verdict: true },
  });

  // Re-time my submissions as if my start were the contest start
  const offset = vp.startedAt.getTime() - contest.startsAt.getTime();
  const adjusted: StandingSubmission[] = mySubs.map((s) => ({
    ...s,
    createdAt: new Date(new Date(s.createdAt).getTime() - offset),
  }));
  const myRows = computeStandings(adjusted, {
    startsAt: contest.startsAt,
    wrongPenaltyMin: contest.wrongPenaltyMin,
  });
  const me = myRows[0] ?? null;

  let wouldBeRank = null;
  if (me && official) {
    wouldBeRank =
      1 +
      official.rows.filter(
        (r) =>
          r.totalScore > me.totalScore ||
          (r.totalScore === me.totalScore && r.penaltyMin < me.penaltyMin)
      ).length;
  }
  res.json({ me, wouldBeRank, officialSize: official?.rows.length ?? 0 });
});
