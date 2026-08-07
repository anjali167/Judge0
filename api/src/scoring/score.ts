/**
 * Pure scoring logic — the product's trust anchor.
 * No I/O here; exhaustively unit-tested in test/scoring.test.ts.
 */

export type CaseVerdict = "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE" | "IE";

export interface JudgedCase {
  kind: "SAMPLE" | "HIDDEN";
  weight: number;
  verdict: CaseVerdict;
}

export type ScoringMode = "PARTIAL" | "BINARY";

/** Verdict precedence for the overall submission verdict (worst wins, CE dominates). */
const VERDICT_PRECEDENCE: CaseVerdict[] = ["CE", "IE", "RE", "MLE", "TLE", "WA", "AC"];

/**
 * Overall verdict = AC if every case passed, otherwise the highest-precedence
 * failure among the cases. A compile error is global by nature.
 */
export function overallVerdict(cases: JudgedCase[]): CaseVerdict {
  if (cases.length === 0) return "IE";
  for (const v of VERDICT_PRECEDENCE) {
    if (v === "AC") break;
    if (cases.some((c) => c.verdict === v)) return v;
  }
  return cases.every((c) => c.verdict === "AC") ? "AC" : "WA";
}

/**
 * Score a submission out of `points`.
 * - PARTIAL: sum of passed hidden-case weights / total hidden weight, scaled to points.
 *   Result is floored so a participant never scores full points without passing everything.
 * - BINARY: full points iff all hidden cases pass, else 0.
 * Sample cases never contribute to score.
 */
export function scoreSubmission(
  cases: JudgedCase[],
  mode: ScoringMode,
  points: number
): { score: number; maxScore: number } {
  const hidden = cases.filter((c) => c.kind === "HIDDEN");
  const totalWeight = hidden.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0 || points <= 0) return { score: 0, maxScore: points };

  const allPassed = hidden.every((c) => c.verdict === "AC");
  if (mode === "BINARY") {
    return { score: allPassed ? points : 0, maxScore: points };
  }

  if (allPassed) return { score: points, maxScore: points };
  const passedWeight = hidden
    .filter((c) => c.verdict === "AC")
    .reduce((s, c) => s + c.weight, 0);
  return {
    score: Math.floor((passedWeight / totalWeight) * points),
    maxScore: points,
  };
}

/** Per-language time-limit multipliers (spec 5.1). Base limits are C/C++ seconds. */
export const LANGUAGE_TIME_MULTIPLIER: Record<string, number> = {
  c: 1,
  cpp: 1,
  java: 2,
  javascript: 3,
  python: 3,
};

export function effectiveTimeLimit(baseSeconds: number, language: string): number {
  const mult = LANGUAGE_TIME_MULTIPLIER[language] ?? 3;
  // Judge0 caps wall/cpu time; keep a sane ceiling.
  return Math.min(baseSeconds * mult, 20);
}
