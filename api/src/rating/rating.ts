/**
 * Season rating + most-improved — pure logic, unit-tested in test/rating.test.ts.
 *
 * Design (spec 5.5 — "Elo-like or cumulative with decay, implementer proposes"):
 * a transparent exponential-moving-average rating rather than pairwise Elo.
 *
 *   performance = 1000 + 1000 * (N - 2*(rank-1) - 1) / max(N-1, 1)   ∈ [0, 2000]
 *   newRating   = round(old + K * (performance - old)),  K = 0.25, start 1200
 *
 * Rationale: with 100–500 participants and irregular attendance, pairwise Elo is
 * noisy and opaque; an EMA over rank-percentile performance is order-preserving,
 * easy to audit (a spreadsheet reproduces it), converges in ~4-5 contests, and
 * naturally decays stale ratings toward current form.
 */

export const RATING_START = 1200;
export const RATING_K = 0.25;

/** Rank-percentile performance score: winner 2000, median 1000, last 0. */
export function performanceScore(rank: number, participants: number): number {
  if (participants <= 1) return 1000;
  const n = participants;
  const p = 1000 + (1000 * (n - 2 * (rank - 1) - 1)) / (n - 1);
  return Math.round(Math.max(0, Math.min(2000, p)));
}

export function updateRating(oldRating: number, performance: number, k = RATING_K): number {
  return Math.round(oldRating + k * (performance - oldRating));
}

export interface ContestHistoryEntry {
  contestId: string;
  /** chronological index — entries must be passed oldest-first */
  performance: number;
  rank: number;
}

/**
 * Most-improved metric (spec 5.5): Δ = latest performance minus the mean
 * performance of the trailing k contests before it. Requires at least
 * `minHistory` prior contests (default 1) — otherwise null (no baseline).
 * Entries must be ordered oldest → newest.
 */
export function improvementDelta(
  history: ContestHistoryEntry[],
  k = 3,
  minHistory = 1
): number | null {
  if (history.length < minHistory + 1) return null;
  const latest = history[history.length - 1];
  const trailing = history.slice(Math.max(0, history.length - 1 - k), history.length - 1);
  if (trailing.length === 0) return null;
  const avg = trailing.reduce((s, h) => s + h.performance, 0) / trailing.length;
  return Math.round(latest.performance - avg);
}
