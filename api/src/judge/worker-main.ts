/** Standalone judge-worker entrypoint (own container; scale horizontally on contest day). */
import { startJudgeWorker } from "./worker.js";

const concurrency = parseInt(process.env.JUDGE_CONCURRENCY ?? "2", 10);
startJudgeWorker(concurrency);
console.log(`[judge] worker started (concurrency=${concurrency})`);
