/**
 * Quiz grading — pure logic, unit-tested in test/quiz.test.ts.
 *
 * Question kinds (spec 5.4):
 * - SINGLE / CODE_OUTPUT: one correct option id; wrong pick costs negativeMarks.
 * - MULTI: exact-set match earns marks; any wrong/incomplete selection costs
 *   negativeMarks (all-or-nothing keeps scoring evidence-based and simple).
 * - NUMERIC: |given - value| <= tolerance earns marks.
 * Unanswered questions score 0 (never negative).
 */

export interface QuizQuestionSpec {
  id: string;
  kind: "SINGLE" | "MULTI" | "NUMERIC" | "CODE_OUTPUT";
  marks: number;
  negativeMarks: number;
  /** SINGLE/MULTI/CODE_OUTPUT: correct option ids. NUMERIC: {value, tolerance}. */
  answer: string[] | { value: number; tolerance: number };
}

export type QuizAnswers = Record<string, string[] | number | undefined>;

export interface QuestionResult {
  questionId: string;
  status: "correct" | "wrong" | "unanswered";
  earned: number;
}

export interface GradeResult {
  score: number;
  maxScore: number;
  breakdown: QuestionResult[];
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export function gradeAttempt(questions: QuizQuestionSpec[], answers: QuizAnswers): GradeResult {
  const breakdown: QuestionResult[] = [];
  let score = 0;
  let maxScore = 0;

  for (const q of questions) {
    maxScore += q.marks;
    const given = answers[q.id];

    let status: QuestionResult["status"];
    if (
      given === undefined ||
      given === null ||
      (Array.isArray(given) && given.length === 0)
    ) {
      status = "unanswered";
    } else if (q.kind === "NUMERIC") {
      const spec = q.answer as { value: number; tolerance: number };
      const num = typeof given === "number" ? given : Number(given);
      status =
        Number.isFinite(num) && Math.abs(num - spec.value) <= spec.tolerance
          ? "correct"
          : "wrong";
    } else {
      const correct = q.answer as string[];
      const picked = Array.isArray(given) ? given : [String(given)];
      status = sameSet(picked, correct) ? "correct" : "wrong";
    }

    const earned =
      status === "correct" ? q.marks : status === "wrong" ? -q.negativeMarks : 0;
    score += earned;
    breakdown.push({ questionId: q.id, status, earned });
  }

  return { score, maxScore, breakdown };
}

/**
 * Deterministic per-user shuffle (spec 5.4: question/option order randomized
 * per participant, stable across reloads). Fisher–Yates with a seeded PRNG.
 */
export function seededShuffle<T>(items: T[], seedStr: string): T[] {
  let seed = 2166136261;
  for (const ch of seedStr) {
    seed ^= ch.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  const rand = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
