/**
 * Participant profile (spec 5.8): solve counts by tag/difficulty, contest
 * history, rating trend, streaks, badges. Visibility of other users' profiles
 * is an instance setting; your own profile is always available.
 */
import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { computeStreaks, computeBadges } from "../profile/badges.js";
import { getUserRatingHistory } from "../rating/service.js";
import { getSetting } from "../settings.js";
import { config } from "../config.js";

export const profileRouter = Router();

async function buildProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, externalId: true, createdAt: true, group: { select: { name: true } } },
  });
  if (!user) return null;

  const acs = await prisma.submission.findMany({
    where: { userId, verdict: "AC" },
    select: { problemId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const solvedIds = [...new Set(acs.map((a) => a.problemId))];
  const problems = await prisma.problem.findMany({
    where: { id: { in: solvedIds } },
    select: { id: true, difficulty: true, tags: true },
  });

  const byDifficulty: Record<number, number> = {};
  const byTag: Record<string, number> = {};
  for (const p of problems) {
    byDifficulty[p.difficulty] = (byDifficulty[p.difficulty] ?? 0) + 1;
    for (const t of p.tags) byTag[t] = (byTag[t] ?? 0) + 1;
  }

  const ratingHistory = await getUserRatingHistory(userId);
  const bestRank = ratingHistory.length ? Math.min(...ratingHistory.map((r) => r.rank)) : null;

  // streaks in the instance timezone (default IST offset if unparseable)
  const tzOffsetMin = config.timezone === "Asia/Kolkata" ? 330 : 0;
  const streaks = computeStreaks(acs.map((a) => new Date(a.createdAt)), tzOffsetMin);

  const stats = {
    solvedTotal: solvedIds.length,
    contestsPlayed: ratingHistory.length,
    bestRank,
    currentStreakDays: streaks.current,
    maxStreakDays: streaks.max,
  };

  return {
    user,
    stats,
    byDifficulty,
    byTag,
    badges: computeBadges(stats),
    ratingHistory,
    currentRating: ratingHistory.length ? ratingHistory[ratingHistory.length - 1].ratingAfter : null,
  };
}

profileRouter.get("/profile/me", requireAuth, async (req, res) => {
  const profile = await buildProfile(req.user!.id);
  if (!profile) return res.status(404).json({ error: "not found" });
  res.json(profile);
});

profileRouter.get("/profile/:userId", requireAuth, async (req, res) => {
  const visibility = await getSetting("profile_visibility", "public"); // public-within-instance | organizer-only
  const isSelf = req.params.userId === req.user!.id;
  const isOrganizer = req.user!.role !== "PARTICIPANT";
  if (!isSelf && !isOrganizer && visibility !== "public") {
    return res.status(403).json({ error: "profiles are organizer-only on this instance" });
  }
  const profile = await buildProfile(req.params.userId);
  if (!profile) return res.status(404).json({ error: "not found" });
  res.json(profile);
});
