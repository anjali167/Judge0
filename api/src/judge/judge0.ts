/**
 * Thin Judge0 CE client. Languages are mapped by our stable keys so the
 * platform survives Judge0 language-id churn; extend LANGUAGES to add more.
 */
import { config } from "../config.js";

export interface Judge0Result {
  statusId: number;
  time: number | null; // seconds
  memory: number | null; // KB
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
}

/** Judge0 CE language ids (v1.13.x). */
export const LANGUAGES: Record<string, { judge0Id: number; label: string }> = {
  c: { judge0Id: 50, label: "C (GCC 9.2)" },
  cpp: { judge0Id: 54, label: "C++ (GCC 9.2)" },
  java: { judge0Id: 62, label: "Java (OpenJDK 13)" },
  python: { judge0Id: 71, label: "Python (3.8)" },
  javascript: { judge0Id: 63, label: "JavaScript (Node 12)" },
};

// Judge0 status ids -> our verdicts
// 1 In Queue, 2 Processing, 3 Accepted, 4 Wrong Answer, 5 TLE, 6 Compilation error,
// 7-12 Runtime errors, 13 Internal error, 14 Exec format error
export function statusToVerdict(statusId: number, memoryKb: number | null, memLimitKb: number): string {
  if (statusId === 3) return "AC";
  if (statusId === 4) return "WA";
  if (statusId === 5) return "TLE";
  if (statusId === 6) return "CE";
  if (statusId >= 7 && statusId <= 12) {
    // Judge0 reports SIGSEGV etc. for memory kills; classify as MLE when at the limit
    if (memoryKb !== null && memoryKb >= memLimitKb) return "MLE";
    return "RE";
  }
  return "IE";
}

const headers = (): Record<string, string> => ({
  "Content-Type": "application/json",
  ...(config.judge0AuthToken ? { "X-Auth-Token": config.judge0AuthToken } : {}),
});

/**
 * Run one test case synchronously (wait=true keeps our worker model simple:
 * BullMQ provides the async queue; Judge0 just executes).
 */
export async function runCase(params: {
  languageKey: string;
  source: string;
  stdin: string;
  expectedOutput?: string;
  cpuTimeLimitSec: number;
  memoryLimitKb: number;
}): Promise<Judge0Result> {
  const lang = LANGUAGES[params.languageKey];
  if (!lang) throw new Error(`Unsupported language: ${params.languageKey}`);

  const body = {
    language_id: lang.judge0Id,
    source_code: Buffer.from(params.source).toString("base64"),
    stdin: Buffer.from(params.stdin).toString("base64"),
    ...(params.expectedOutput !== undefined
      ? { expected_output: Buffer.from(params.expectedOutput).toString("base64") }
      : {}),
    cpu_time_limit: params.cpuTimeLimitSec,
    wall_time_limit: Math.min(params.cpuTimeLimitSec * 2 + 2, 30),
    memory_limit: params.memoryLimitKb,
    redirect_stderr_to_stdout: false,
  };

  const res = await fetch(
    `${config.judge0Url}/submissions?base64_encoded=true&wait=true`,
    { method: "POST", headers: headers(), body: JSON.stringify(body) }
  );
  if (!res.ok) {
    throw new Error(`judge0 ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    status: { id: number };
    time: string | null;
    memory: number | null;
    stdout: string | null;
    stderr: string | null;
    compile_output: string | null;
  };

  const b64 = (v: string | null) =>
    v === null ? null : Buffer.from(v, "base64").toString("utf8");

  return {
    statusId: data.status.id,
    time: data.time === null ? null : parseFloat(data.time),
    memory: data.memory,
    stdout: b64(data.stdout),
    stderr: b64(data.stderr),
    compileOutput: b64(data.compile_output),
  };
}

export async function judgeHealth(): Promise<{ ok: boolean; workers?: unknown }> {
  try {
    const res = await fetch(`${config.judge0Url}/workers`, { headers: headers() });
    if (!res.ok) return { ok: false };
    return { ok: true, workers: await res.json() };
  } catch {
    return { ok: false };
  }
}
