import { Queue } from "bullmq";
import { makeQueueConnection } from "../redis.js";

export interface JudgeJobData {
  submissionId: string;
  /** true = run against sample cases only (unscored "Run"), false = full submit */
  sampleOnly: boolean;
}

export const JUDGE_QUEUE_NAME = "judge";

export const judgeQueue = new Queue<JudgeJobData>(JUDGE_QUEUE_NAME, {
  connection: makeQueueConnection(),
  defaultJobOptions: {
    attempts: 3, // survives judge worker restarts (acceptance walkthrough #5)
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export async function queueDepth(): Promise<number> {
  const counts = await judgeQueue.getJobCounts("waiting", "active", "delayed");
  return (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
}

/** 1-based position of a submission's job in the waiting list, or 0 if active/done. */
export async function queuePosition(submissionId: string): Promise<number> {
  const waiting = await judgeQueue.getWaiting(0, 2000);
  const idx = waiting.findIndex((j) => j.data.submissionId === submissionId);
  return idx === -1 ? 0 : idx + 1;
}
