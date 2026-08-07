/**
 * Judge worker: consumes submission jobs, runs each test case through Judge0,
 * scores the submission (pure logic in ../scoring/score.ts), persists results,
 * and publishes a leaderboard update event on Redis pub/sub.
 */
import { Worker, type Job } from "bullmq";
import { prisma } from "../db.js";
import { makeQueueConnection, redis } from "../redis.js";
import { JUDGE_QUEUE_NAME, type JudgeJobData } from "./queue.js";
import { runCase, statusToVerdict } from "./judge0.js";
import {
  scoreSubmission,
  overallVerdict,
  effectiveTimeLimit,
  type JudgedCase,
  type CaseVerdict,
} from "../scoring/score.js";

export const LEADERBOARD_CHANNEL = "leaderboard:update";
export const SUBMISSION_CHANNEL = "submission:update";

async function processJob(job: Job<JudgeJobData>) {
  const { submissionId, sampleOnly } = job.data;

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      problem: { include: { testCases: { orderBy: [{ kind: "asc" }, { ordinal: "asc" }] } } },
    },
  });
  if (!submission) return; // deleted meanwhile

  await prisma.submission.update({
    where: { id: submissionId },
    data: { verdict: "RUNNING" },
  });

  const cases = sampleOnly
    ? submission.problem.testCases.filter((tc) => tc.kind === "SAMPLE")
    : submission.problem.testCases;

  const timeLimit = effectiveTimeLimit(submission.problem.timeLimit, submission.language);
  const memLimit = submission.problem.memLimit;

  const judged: JudgedCase[] = [];
  const resultRows: {
    testCaseId: string;
    verdict: CaseVerdict;
    timeMs: number | null;
    memoryKb: number | null;
  }[] = [];
  let compileOutput: string | null = null;
  let maxTimeMs = 0;
  let maxMemKb = 0;

  for (const tc of cases) {
    const r = await runCase({
      languageKey: submission.language,
      source: submission.source,
      stdin: tc.input,
      expectedOutput: tc.expectedOutput,
      cpuTimeLimitSec: timeLimit,
      memoryLimitKb: memLimit,
    });
    const verdict = statusToVerdict(r.statusId, r.memory, memLimit) as CaseVerdict;
    judged.push({ kind: tc.kind, weight: tc.weight, verdict });
    resultRows.push({
      testCaseId: tc.id,
      verdict,
      timeMs: r.time === null ? null : Math.round(r.time * 1000),
      memoryKb: r.memory,
    });
    if (r.time) maxTimeMs = Math.max(maxTimeMs, Math.round(r.time * 1000));
    if (r.memory) maxMemKb = Math.max(maxMemKb, r.memory);

    if (verdict === "CE") {
      // Compile error is global: stop, record compiler output (safe to show — no hidden data)
      compileOutput = r.compileOutput ?? r.stderr ?? "Compilation failed";
      break;
    }
  }

  const verdict = overallVerdict(judged);

  // Scoring only applies to real submits with a contest attached (or practice)
  let score = 0;
  let maxScore = 0;
  if (!sampleOnly) {
    let points = 100;
    let mode: "PARTIAL" | "BINARY" = "PARTIAL";
    if (submission.contestId) {
      const cp = await prisma.contestProblem.findUnique({
        where: {
          contestId_problemId: {
            contestId: submission.contestId,
            problemId: submission.problemId,
          },
        },
        include: { contest: true },
      });
      if (cp) {
        points = cp.points;
        mode = cp.contest.scoringMode;
      }
    }
    const s = scoreSubmission(judged, mode, points);
    score = s.score;
    maxScore = s.maxScore;
  }

  await prisma.$transaction([
    prisma.submissionResult.deleteMany({ where: { submissionId } }),
    prisma.submissionResult.createMany({
      data: resultRows.map((r) => ({ submissionId, ...r })),
    }),
    prisma.submission.update({
      where: { id: submissionId },
      data: {
        verdict,
        score,
        maxScore,
        execTimeMs: maxTimeMs || null,
        memoryKb: maxMemKb || null,
        compileOutput: verdict === "CE" ? compileOutput : null,
      },
    }),
  ]);

  await redis.publish(
    SUBMISSION_CHANNEL,
    JSON.stringify({ submissionId, userId: submission.userId, verdict, score })
  );
  if (!sampleOnly && submission.contestId) {
    await redis.publish(
      LEADERBOARD_CHANNEL,
      JSON.stringify({ contestId: submission.contestId })
    );
  }
}

export function startJudgeWorker(concurrency = 2): Worker<JudgeJobData> {
  const worker = new Worker<JudgeJobData>(JUDGE_QUEUE_NAME, processJob, {
    connection: makeQueueConnection(),
    concurrency,
  });
  worker.on("failed", async (job, err) => {
    console.error(`[judge] job ${job?.id} failed:`, err.message);
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await prisma.submission.update({
        where: { id: job.data.submissionId },
        data: { verdict: "IE" },
      }).catch(() => {});
    }
  });
  worker.on("completed", (job) => {
    console.log(`[judge] judged submission ${job.data.submissionId}`);
  });
  return worker;
}
