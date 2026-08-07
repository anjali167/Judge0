/**
 * Post-contest discussion per problem (spec 5.3). Threads open only once the
 * problem is out of any active/upcoming contest.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { getModules } from "../settings.js";

export const commentsRouter = Router();

async function discussionOpen(problemId: string): Promise<boolean> {
  const locked = await prisma.contestProblem.findFirst({
    where: { problemId, contest: { endsAt: { gt: new Date() } } },
  });
  return !locked;
}

commentsRouter.get("/problems/:id/comments", requireAuth, async (req, res) => {
  if (!(await getModules()).discussion) return res.json({ open: false, comments: [] });
  const open = await discussionOpen(req.params.id);
  const comments = open
    ? await prisma.comment.findMany({
        where: { problemId: req.params.id },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: {
          id: true,
          body: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      })
    : [];
  res.json({ open, comments });
});

const postSchema = z.object({ body: z.string().min(1).max(5000) });

commentsRouter.post("/problems/:id/comments", requireAuth, async (req, res) => {
  if (!(await getModules()).discussion) {
    return res.status(403).json({ error: "discussion is disabled on this instance" });
  }
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid payload" });
  if (!(await discussionOpen(req.params.id))) {
    return res.status(403).json({ error: "discussion opens after the contest ends" });
  }
  const problem = await prisma.problem.findUnique({ where: { id: req.params.id } });
  if (!problem) return res.status(404).json({ error: "not found" });

  const comment = await prisma.comment.create({
    data: { problemId: problem.id, userId: req.user!.id, body: parsed.data.body },
    select: { id: true, body: true, createdAt: true, user: { select: { id: true, name: true } } },
  });
  res.status(201).json(comment);
});
