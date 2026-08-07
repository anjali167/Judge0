import { prisma } from "../db.js";
import { buildLeaderboard } from "../leaderboard/service.js";
import {
  performanceScore,
  updateRating,
  improvementDelta,
  RATING_START,
} from "./rating.js";

/**
 * Finalize season ratings for an ended contest (idempotent).
 * Called from the admin endpoint and lazily on first post-contest
 * leaderboard/rating view.
 */
export async function finalizeContestRatings(contestId: string): Promise<boolean> {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest || contest.ratingsFinalized) return false;
  if (new Date() < contest.endsAt) return false;

  const payload = await buildLeaderboard(contestId, { ignoreFreeze: true });
  if (!payload || payload.rows.length === 0) {
    await prisma.contest.update({ where: { id: contestId }, data: { ratingsFinalized: true } });
    return true;
  }

  const n = payload.rows.length;
  for (const row of payload.rows) {
    const last = await prisma.rating.findFirst({
      where: { userId: row.userId },
      orderBy: { createdAt: "desc" },
    });
    const before = last?.ratingAfter ?? RATING_START;
    const perf = performanceScore(row.rank, n);
    await prisma.rating.upsert({
      where: { userId_contestId: { userId: row.userId, contestId } },
      update: {},
      create: {
        userId: row.userId,
        contestId,
        ratingBefore: before,
        ratingAfter: updateRating(before, perf),
        performance: perf,
        rank: row.rank,
        score: row.totalScore,
      },
    });
  }
  await prisma.contest.update({ where: { id: contestId }, data: { ratingsFinalized: true } });
  return true;
}

export interface MostImprovedRow {
  userId: string;
  name: string;
  externalId: string | null;
  groupName: string | null;
  delta: number;
  performance: number;
  rank: number;
  contestsCounted: number;
}

/**
 * Most-improved view for a contest (spec 5.5): Δ vs each participant's
 * trailing-k performance average. k configurable via instance setting.
 */
export async function getMostImproved(contestId: string, k = 3): Promise<MostImprovedRow[]> {
  await finalizeContestRatings(contestId).catch(() => {});

  const contestRatings = await prisma.rating.findMany({
    where: { contestId },
    include: {
      user: { select: { name: true, externalId: true, group: { select: { name: true } } } },
      contest: { select: { endsAt: true } },
    },
  });

  const rows: MostImprovedRow[] = [];
  for (const r of contestRatings) {
    const history = await prisma.rating.findMany({
      where: { userId: r.userId, contest: { endsAt: { lte: r.contest.endsAt } } },
      orderBy: { contest: { endsAt: "asc" } },
      select: { contestId: true, performance: true, rank: true },
    });
    const delta = improvementDelta(history, k);
    if (delta === null) continue;
    rows.push({
      userId: r.userId,
      name: r.user.name,
      externalId: r.user.externalId,
      groupName: r.user.group?.name ?? null,
      delta,
      performance: r.performance,
      rank: r.rank,
      contestsCounted: Math.min(k, history.length - 1),
    });
  }
  rows.sort((a, b) => b.delta - a.delta);
  return rows;
}

export async function getUserRatingHistory(userId: string) {
  return prisma.rating.findMany({
    where: { userId },
    orderBy: { contest: { endsAt: "asc" } },
    select: {
      contestId: true,
      ratingBefore: true,
      ratingAfter: true,
      performance: true,
      rank: true,
      score: true,
      contest: { select: { title: true, endsAt: true } },
    },
  });
}
