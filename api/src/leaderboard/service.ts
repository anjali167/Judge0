/**
 * Leaderboard service: loads contest submissions, delegates ordering to the
 * pure standings module, caches in Redis, and broadcasts over Socket.IO.
 */
import type { Server } from "socket.io";
import { prisma } from "../db.js";
import { redis } from "../redis.js";
import { computeStandings, type StandingRow } from "./standings.js";
import { LEADERBOARD_CHANNEL } from "../judge/worker.js";
import { makeQueueConnection } from "../redis.js";

const CACHE_TTL_SEC = 5;

export interface LeaderboardPayload {
  contestId: string;
  generatedAt: string;
  rows: (StandingRow & { name: string; externalId: string | null; groupName: string | null })[];
}

export async function buildLeaderboard(contestId: string): Promise<LeaderboardPayload | null> {
  const cacheKey = `lb:${contestId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as LeaderboardPayload;

  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) return null;

  const submissions = await prisma.submission.findMany({
    where: { contestId, verdict: { notIn: ["PENDING", "RUNNING"] } },
    select: {
      userId: true,
      problemId: true,
      score: true,
      maxScore: true,
      createdAt: true,
      verdict: true,
    },
  });

  const rows = computeStandings(
    submissions.map((s) => ({ ...s, createdAt: new Date(s.createdAt) })),
    { startsAt: contest.startsAt, wrongPenaltyMin: contest.wrongPenaltyMin }
  );

  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: { id: true, name: true, externalId: true, group: { select: { name: true } } },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const payload: LeaderboardPayload = {
    contestId,
    generatedAt: new Date().toISOString(),
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
  await redis.del(`lb:${contestId}`);
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
