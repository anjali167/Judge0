/**
 * Leaderboard service: loads contest submissions (code + quiz), applies the
 * freeze window, delegates ordering to the pure standings module, caches in
 * Redis, and broadcasts over Socket.IO.
 */
import type { Server } from "socket.io";
import { prisma } from "../db.js";
import { redis } from "../redis.js";
import {
  computeStandings,
  freezeCutoff,
  type StandingRow,
  type StandingSubmission,
} from "./standings.js";
import { LEADERBOARD_CHANNEL } from "../judge/worker.js";
import { makeQueueConnection } from "../redis.js";

const CACHE_TTL_SEC = 5;

/** Synthetic "problem" id under which a contest's quiz section scores appear. */
export const QUIZ_ITEM_ID = "quiz";

export interface LeaderboardPayload {
  contestId: string;
  generatedAt: string;
  frozen: boolean;
  frozenAt: string | null;
  rows: (StandingRow & { name: string; externalId: string | null; groupName: string | null })[];
}

export async function buildLeaderboard(
  contestId: string,
  opts: { ignoreFreeze?: boolean } = {}
): Promise<LeaderboardPayload | null> {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) return null;

  const now = new Date();
  const cutoff = opts.ignoreFreeze ? null : freezeCutoff(contest, now);
  const cacheKey = cutoff ? `lb:frozen:${contestId}` : `lb:${contestId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as LeaderboardPayload;

  const submissions = await prisma.submission.findMany({
    where: {
      contestId,
      virtual: false, // virtual attempts never touch the official board
      verdict: { notIn: ["PENDING", "RUNNING"] },
      ...(cutoff ? { createdAt: { lt: cutoff } } : {}),
    },
    select: {
      userId: true,
      problemId: true,
      score: true,
      maxScore: true,
      createdAt: true,
      verdict: true,
    },
  });

  const entries: StandingSubmission[] = submissions.map((s) => ({
    ...s,
    createdAt: new Date(s.createdAt),
  }));

  // Quiz attempts feed the same standings pipeline as a synthetic item.
  const attempts = await prisma.quizAttempt.findMany({
    where: { contestId, ...(cutoff ? { submittedAt: { lt: cutoff } } : {}) },
    select: { userId: true, score: true, maxScore: true, submittedAt: true },
  });
  for (const a of attempts) {
    entries.push({
      userId: a.userId,
      problemId: QUIZ_ITEM_ID,
      score: Math.max(0, a.score), // negative marking floors at 0 on the board
      maxScore: a.maxScore,
      createdAt: new Date(a.submittedAt),
      verdict: "AC",
    });
  }

  const rows = computeStandings(entries, {
    startsAt: contest.startsAt,
    wrongPenaltyMin: contest.wrongPenaltyMin,
  });

  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: { id: true, name: true, externalId: true, group: { select: { name: true } } },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const payload: LeaderboardPayload = {
    contestId,
    generatedAt: now.toISOString(),
    frozen: cutoff !== null,
    frozenAt: cutoff?.toISOString() ?? null,
    rows: rows.map((r) => ({
      ...r,
      name: userMap.get(r.userId)?.name ?? "?",
      externalId: userMap.get(r.userId)?.externalId ?? null,
      groupName: userMap.get(r.userId)?.group?.name ?? null,
    })),
  };

  await redis.set(cacheKey, JSON.stringify(payload), "EX", CACHE_TTL_SEC);
  return payload;
}

export async function invalidateLeaderboard(contestId: string) {
  await redis.del(`lb:${contestId}`, `lb:frozen:${contestId}`);
}

/**
 * Subscribe to judge-worker events and push fresh standings to the contest room.
 * Uses a dedicated Redis connection (subscriber mode blocks the shared one).
 */
export function wireLeaderboardBroadcast(io: Server) {
  const sub = makeQueueConnection();
  sub.subscribe(LEADERBOARD_CHANNEL);
  sub.on("message", async (_channel, message) => {
    try {
      const { contestId } = JSON.parse(message) as { contestId: string };
      await invalidateLeaderboard(contestId);
      const payload = await buildLeaderboard(contestId);
      if (payload) io.to(`contest:${contestId}`).emit("leaderboard", payload);
    } catch (err) {
      console.error("[leaderboard] broadcast error:", err);
    }
  });
}
