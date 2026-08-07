import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";

export const problemsRouter = Router();

/** Practice archive: problems not locked inside an active/upcoming contest. */
problemsRouter.get("/", requireAuth, async (req, res) => {
  const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
  const difficulty = req.query.difficulty ? Number(req.query.difficulty) : undefined;

  const now = new Date();
  // Problems attached to a contest that hasn't ended yet are hidden from practice
  const lockedIds = (
    await prisma.contestProblem.findMany({
      where: { contest: { endsAt: { gt: now } } },
      select: { problemId: true },
    })
  ).map((cp) => cp.problemId);

  const problems = await prisma.problem.findMany({
    where: {
      archived: false,
      id: { notIn: lockedIds },
      ...(tag ? { tags: { has: tag } } : {}),
      ...(difficulty ? { difficulty } : {}),
    },
    select: {
      id: true,
      slug: true,
      title: true,
      difficulty: true,
      tags: true,
      editorialReleased: true,
    },
    orderBy: [{ difficulty: "asc" }, { title: "asc" }],
  });

  // solved markers for the current user
  const solved = await prisma.submission.groupBy({
    by: ["problemId"],
    where: { userId: req.user!.id, verdict: "AC" },
    _count: true,
  });
  const solvedSet = new Set(solved.map((s) => s.problemId));

  res.json(problems.map((p) => ({ ...p, solved: solvedSet.has(p.id) })));
});

/** Problem detail: statement + sample cases only. Hidden cases never leave the server. */
problemsRouter.get("/:slug", requireAuth, async (req, res) => {
  const problem = await prisma.problem.findUnique({
    where: { slug: req.params.slug },
    select: {
      id: true,
      slug: true,
      title: true,
      statementMd: true,
      difficulty: true,
      tags: true,
      timeLimit: true,
      memLimit: true,
      editorialReleased: true,
      editorialMd: true,
      testCases: {
        where: { kind: "SAMPLE" },
        orderBy: { ordinal: "asc" },
        select: { ordinal: true, input: true, expectedOutput: true },
      },
    },
  });
  if (!problem) return res.status(404).json({ error: "not found" });

  const now = new Date();
  const activeContest = await prisma.contestProblem.findFirst({
    where: {
      problemId: problem.id,
      contest: { startsAt: { lte: now }, endsAt: { gt: now } },
    },
    select: { contestId: true },
  });
  const upcoming = await prisma.contestProblem.findFirst({
    where: { problemId: problem.id, contest: { startsAt: { gt: now } } },
  });
  if (upcoming && !activeContest) {
    return res.status(403).json({ error: "problem is locked until its contest starts" });
  }

  const { editorialMd, editorialReleased, ...rest } = problem;
  res.json({
    ...rest,
    editorial: editorialReleased ? editorialMd : null,
    activeContestId: activeContest?.contestId ?? null,
  });
});
