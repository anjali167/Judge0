import { describe, it, expect } from "vitest";
import { computeStreaks, computeBadges } from "../src/profile/badges.js";

const day = (n: number) => new Date(Date.UTC(2026, 7, n, 12)); // Aug n, noon UTC

describe("computeStreaks", () => {
  it("empty history", () => {
    expect(computeStreaks([], 0, day(10))).toEqual({ current: 0, max: 0 });
  });
  it("consecutive days count", () => {
    const r = computeStreaks([day(1), day(2), day(3)], 0, day(3));
    expect(r).toEqual({ current: 3, max: 3 });
  });
  it("multiple solves per day count once", () => {
    const r = computeStreaks([day(1), day(1), day(2)], 0, day(2));
    expect(r).toEqual({ current: 2, max: 2 });
  });
  it("gap breaks the streak; max remembers the best run", () => {
    const r = computeStreaks([day(1), day(2), day(3), day(7)], 0, day(7));
    expect(r.max).toBe(3);
    expect(r.current).toBe(1);
  });
  it("streak still 'current' if last AC was yesterday", () => {
    const r = computeStreaks([day(4), day(5)], 0, day(6));
    expect(r.current).toBe(2);
  });
  it("stale streak (2+ days ago) is not current", () => {
    const r = computeStreaks([day(1), day(2)], 0, day(6));
    expect(r.current).toBe(0);
    expect(r.max).toBe(2);
  });
  it("timezone offset shifts day boundaries", () => {
    // 23:30 UTC Aug 1 = Aug 2 05:00 in +5:30
    const late = new Date(Date.UTC(2026, 7, 1, 23, 30));
    const r0 = computeStreaks([late, day(2)], 0, day(2));
    const rIndia = computeStreaks([late, day(2)], 330, day(2));
    expect(r0.max).toBe(2); // Aug 1 + Aug 2 in UTC
    expect(rIndia.max).toBe(1); // both are Aug 2 in IST
  });
});

describe("computeBadges", () => {
  const base = { solvedTotal: 0, contestsPlayed: 0, bestRank: null, currentStreakDays: 0, maxStreakDays: 0 };
  it("no badges for a blank profile", () => {
    expect(computeBadges(base)).toEqual([]);
  });
  it("solve milestones", () => {
    const ids = computeBadges({ ...base, solvedTotal: 12 }).map((b) => b.id);
    expect(ids).toContain("first-solve");
    expect(ids).toContain("solver-10");
    expect(ids).not.toContain("solver-50");
  });
  it("podium requires rank <= 3", () => {
    expect(computeBadges({ ...base, bestRank: 3 }).map((b) => b.id)).toContain("podium");
    expect(computeBadges({ ...base, bestRank: 4 }).map((b) => b.id)).not.toContain("podium");
  });
  it("streak badges use max streak", () => {
    const ids = computeBadges({ ...base, maxStreakDays: 7 }).map((b) => b.id);
    expect(ids).toContain("streak-3");
    expect(ids).toContain("streak-7");
  });
});
