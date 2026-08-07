/**
 * Anti-cheat telemetry ingest (spec 5.6): tab-visibility + paste events during
 * live contests. Signals for organizers only — participants are never blocked.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";

export const telemetryRouter = Router();

const limiter = rateLimit({ windowMs: 60_000, limit: 60 });

const schema = z.object({
  contestId: z.string(),
  events: z
    .array(
      z.object({
        kind: z.enum(["TAB_HIDDEN", "TAB_VISIBLE", "PASTE"]),
        at: z.string().datetime().optional(),
        meta: z.record(z.unknown()).optional(),
      })
    )
    .min(1)
    .max(50),
});

telemetryRouter.post("/telemetry", requireAuth, limiter, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid payload" });
  const { contestId, events } = parsed.data;

  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  const now = new Date();
  // only record during the live window; anything else is silently ignored
  if (!contest || now < contest.startsAt || now > contest.endsAt) {
    return res.json({ recorded: 0 });
  }

  await prisma.telemetryEvent.createMany({
    data: events.map((e) => ({
      userId: req.user!.id,
      contestId,
      kind: e.kind,
      meta: (e.meta ?? undefined) as object | undefined,
      at: e.at ? new Date(e.at) : now,
    })),
  });
  res.json({ recorded: events.length });
});
