/**
 * Pure leaderboard-ordering logic — the product's trust anchor, part 2.
 * Computes contest standings from a flat list of scored submissions.
 * No I/O; exhaustively unit-tested in test/standings.test.ts.
 */

export interface StandingSubmission {
  userId: string;
  problemId: string;
  score: number; // points earned on this submission
  maxScore: number; // contest points for the problem
  createdAt: Date; // submission time
  verdict: string; // overall verdict
}

export interface ContestInfo {
  startsAt: Date;
  wrongPenaltyMin: number;
}

/**
 * Freeze cutoff (spec 5.5): with freezeMin > 0, submissions in the final
 * freezeMin minutes are hidden from the public board while the contest runs.
 * After the contest ends the board unfreezes. Returns null when no freeze applies.
 */
export function freezeCutoff(
  contest: { endsAt: Date; freezeMin: number },
  now: Date
): Date | null {
  if (contest.freezeMin <= 0) return null;
  const cutoff = new Date(contest.endsAt.getTime() - contest.freezeMin * 60000);
  if (now >= cutoff && now < contest.endsAt) return cutoff;
  return null;
}

export interface ProblemCell {
  problemId: string;
  bestScore: number;
  solved: boolean; // reached full points
  attempts: number; // submissions up to and including the best one
  wrongBefore: number; // scored-zero-or-lower attempts before best score achieved
  bestAtMin: number | null; // minutes from contest start when best score achieved
}

export interface StandingRow {
  userId: string;
  totalScore: number;
  penaltyMin: number; // sum over solved/scored problems: time-of-best + wrongPenalty * wrongBefore
  lastImprovementAt: Date | null;
  problems: Record<string, ProblemCell>;
  rank: number; // 1-based, dense? -> standard competition ranking (1,2,2,4)
}

/**
 * Per-problem folding rule:
 * - bestScore = max score across the user's submissions for the problem.
 * - The *first* submission that achieves bestScore fixes bestAt; later equal
 *   scores don't improve time. Wrong attempts counted are those strictly
 *   before that submission whose score < bestScore (CE submissions are NOT
 *   penalized, matching ICPC convention).
 */
export function foldProblem(
  subs: StandingSubmission[],
  contest: ContestInfo
): ProblemCell | null {
  if (subs.length === 0) return null;
  const sorted = [...subs].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const bestScore = Math.max(...sorted.map((s) => s.score));
  const problemId = sorted[0].problemId;
  const maxScore = sorted[0].maxScore;

  let wrongBefore = 0;
  let bestAt: Date | null = null;
  let attempts = 0;
  for (const s of sorted) {
    attempts++;
    if (bestScore > 0 && s.score === bestScore) {
      bestAt = s.createdAt;
      break;
    }
    if (s.verdict !== "CE") wrongBefore++;
  }
  const bestAtMin =
    bestAt === null
      ? null
      : Math.max(
          0,
          Math.floor((bestAt.getTime() - contest.startsAt.getTime()) / 60000)
        );
  return {
    problemId,
    bestScore,
    solved: bestScore >= maxScore && maxScore > 0,
    attempts,
    wrongBefore: bestScore > 0 ? wrongBefore : sorted.filter((s) => s.verdict !== "CE").length,
    bestAtMin,
  };
}

/**
 * Ordering: total score DESC, then penalty ASC, then earliest last-improvement,
 * then userId for stability. Standard competition ranking (ties share a rank;
 * next rank skips).
 */
export function computeStandings(
  submissions: StandingSubmission[],
  contest: ContestInfo
): StandingRow[] {
  const byUser = new Map<string, Map<string, StandingSubmission[]>>();
  for (const s of submissions) {
    if (!byUser.has(s.userId)) byUser.set(s.userId, new Map());
    const byProblem = byUser.get(s.userId)!;
    if (!byProblem.has(s.problemId)) byProblem.set(s.problemId, []);
    byProblem.get(s.problemId)!.push(s);
  }

  const rows: StandingRow[] = [];
  for (const [userId, byProblem] of byUser) {
    const problems: Record<string, ProblemCell> = {};
    let totalScore = 0;
    let penaltyMin = 0;
    let lastImprovementAt: Date | null = null;

    for (const [problemId, subs] of byProblem) {
      const cell = foldProblem(subs, contest);
      if (!cell) continue;
      problems[problemId] = cell;
      totalScore += cell.bestScore;
      if (cell.bestScore > 0 && cell.bestAtMin !== null) {
        penaltyMin += cell.bestAtMin + contest.wrongPenaltyMin * cell.wrongBefore;
        const best = subs
          .filter((s) => s.score === cell.bestScore)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
        if (!lastImprovementAt || best.createdAt > lastImprovementAt) {
          lastImprovementAt = best.createdAt;
        }
      }
    }

    rows.push({
      userId,
      totalScore,
      penaltyMin,
      lastImprovementAt,
      problems,
      rank: 0,
    });
  }

  rows.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (a.penaltyMin !== b.penaltyMin) return a.penaltyMin - b.penaltyMin;
    const at = a.lastImprovementAt?.getTime() ?? Infinity;
    const bt = b.lastImprovementAt?.getTime() ?? Infinity;
    if (at !== bt) return at - bt;
    return a.userId < b.userId ? -1 : 1;
  });

  // Standard competition ranking: 1, 2, 2, 4
  let prevKey: string | null = null;
  let prevRank = 0;
  rows.forEach((row, i) => {
    const key = `${row.totalScore}|${row.penaltyMin}|${row.lastImprovementAt?.getTime() ?? ""}`;
    if (key === prevKey) {
      row.rank = prevRank;
    } else {
      row.rank = i + 1;
      prevRank = row.rank;
      prevKey = key;
    }
  });

  return rows;
}
