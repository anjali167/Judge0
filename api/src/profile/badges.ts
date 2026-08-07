/**
 * Badges & streaks — pure logic, unit-tested in test/badges.test.ts.
 * Computed on the fly from solve/contest history; no stored state to drift.
 */

export interface ProfileStats {
  solvedTotal: number;
  contestsPlayed: number;
  bestRank: number | null;
  currentStreakDays: number;
  maxStreakDays: number;
}

export interface Badge {
  id: string;
  label: string;
  emoji: string;
}

/**
 * Streaks from a list of AC timestamps: consecutive calendar days (in the
 * given UTC-offset minutes) with at least one accepted submission.
 */
export function computeStreaks(
  acDates: Date[],
  tzOffsetMin = 0,
  today: Date = new Date()
): { current: number; max: number } {
  if (acDates.length === 0) return { current: 0, max: 0 };
  const dayOf = (d: Date) => Math.floor((d.getTime() + tzOffsetMin * 60000) / 86400000);
  const days = [...new Set(acDates.map(dayOf))].sort((a, b) => a - b);

  let max = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1;
    if (run > max) max = run;
  }

  const todayDay = dayOf(today);
  const lastDay = days[days.length - 1];
  let current = 0;
  if (lastDay === todayDay || lastDay === todayDay - 1) {
    current = 1;
    for (let i = days.length - 2; i >= 0; i--) {
      if (days[i] === days[i + 1] - 1) current++;
      else break;
    }
  }
  return { current, max };
}

const RULES: { id: string; label: string; emoji: string; test: (s: ProfileStats) => boolean }[] = [
  { id: "first-solve", label: "First blood", emoji: "🩸", test: (s) => s.solvedTotal >= 1 },
  { id: "solver-10", label: "10 problems solved", emoji: "🔟", test: (s) => s.solvedTotal >= 10 },
  { id: "solver-50", label: "50 problems solved", emoji: "🏋️", test: (s) => s.solvedTotal >= 50 },
  { id: "first-contest", label: "Contestant", emoji: "🎽", test: (s) => s.contestsPlayed >= 1 },
  { id: "regular", label: "5 contests played", emoji: "📅", test: (s) => s.contestsPlayed >= 5 },
  { id: "podium", label: "Podium finish", emoji: "🏆", test: (s) => s.bestRank !== null && s.bestRank <= 3 },
  { id: "streak-3", label: "3-day streak", emoji: "🔥", test: (s) => s.maxStreakDays >= 3 },
  { id: "streak-7", label: "7-day streak", emoji: "☄️", test: (s) => s.maxStreakDays >= 7 },
];

export function computeBadges(stats: ProfileStats): Badge[] {
  return RULES.filter((r) => r.test(stats)).map(({ id, label, emoji }) => ({ id, label, emoji }));
}
