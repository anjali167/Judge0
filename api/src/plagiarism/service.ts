import { prisma } from "../db.js";
import { fingerprints, similarity } from "./similarity.js";

export const DEFAULT_THRESHOLD = 0.75;

/**
 * Scan a contest: for each problem, compare every participant's best
 * (highest-scoring, latest) submission pairwise; store flags above threshold.
 * Idempotent — re-running updates similarity, keeps review status.
 */
export async function scanContest(contestId: string, threshold = DEFAULT_THRESHOLD) {
  const contestProblems = await prisma.contestProblem.findMany({
    where: { contestId },
    select: { problemId: true },
  });

  let comparisons = 0;
  let flagged = 0;

  for (const { problemId } of contestProblems) {
    const submissions = await prisma.submission.findMany({
      where: {
        contestId,
        problemId,
        virtual: false,
        verdict: { notIn: ["PENDING", "RUNNING", "CE"] },
      },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      select: { id: true, userId: true, source: true, language: true },
    });

    // best submission per user (first due to ordering)
    const best = new Map<string, (typeof submissions)[number]>();
    for (const s of submissions) if (!best.has(s.userId)) best.set(s.userId, s);
    const list = [...best.values()];

    const prints = list.map((s) => ({ s, fp: fingerprints(s.source) }));
    for (let i = 0; i < prints.length; i++) {
      for (let j = i + 1; j < prints.length; j++) {
        // cross-language matches are noise with a token-level normalizer
        if (prints[i].s.language !== prints[j].s.language) continue;
        comparisons++;
        const sim = similarity(prints[i].fp, prints[j].fp);
        if (sim < threshold) continue;
        flagged++;
        const [a, b] =
          prints[i].s.id < prints[j].s.id ? [prints[i].s, prints[j].s] : [prints[j].s, prints[i].s];
        await prisma.plagiarismFlag.upsert({
          where: {
            contestId_problemId_submissionA_submissionB: {
              contestId,
              problemId,
              submissionA: a.id,
              submissionB: b.id,
            },
          },
          update: { similarity: sim },
          create: {
            contestId,
            problemId,
            submissionA: a.id,
            submissionB: b.id,
            userA: a.userId,
            userB: b.userId,
            similarity: sim,
          },
        });
      }
    }
  }
  return { comparisons, flagged };
}
