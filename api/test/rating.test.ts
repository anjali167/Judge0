import { describe, it, expect } from "vitest";
import {
  performanceScore,
  updateRating,
  improvementDelta,
  RATING_START,
} from "../src/rating/rating.js";

describe("performanceScore", () => {
  it("winner gets 2000, last gets 0, median ~1000", () => {
    expect(performanceScore(1, 11)).toBe(2000);
    expect(performanceScore(11, 11)).toBe(0);
    expect(performanceScore(6, 11)).toBe(1000);
  });
  it("two participants: 2000 and 0", () => {
    expect(performanceScore(1, 2)).toBe(2000);
    expect(performanceScore(2, 2)).toBe(0);
  });
  it("solo contest is neutral", () => {
    expect(performanceScore(1, 1)).toBe(1000);
  });
  it("tied ranks share performance (rank passed is shared)", () => {
    expect(performanceScore(2, 4)).toBe(performanceScore(2, 4));
    // rank 2 of 4: 1000 + 1000*(4-2-1)/3 = 1333
    expect(performanceScore(2, 4)).toBe(1333);
  });
  it("clamps within [0, 2000]", () => {
    expect(performanceScore(100, 10)).toBe(0);
  });
});

describe("updateRating", () => {
  it("moves 25% toward performance", () => {
    expect(updateRating(1200, 2000)).toBe(1400);
    expect(updateRating(1200, 0)).toBe(900);
    expect(updateRating(1200, 1200)).toBe(1200);
  });
  it("converges toward stable performance over contests", () => {
    let r = RATING_START;
    for (let i = 0; i < 20; i++) r = updateRating(r, 1800);
    expect(Math.abs(r - 1800)).toBeLessThan(15);
  });
  it("never overshoots", () => {
    expect(updateRating(1000, 1400)).toBeLessThanOrEqual(1400);
    expect(updateRating(1400, 1000)).toBeGreaterThanOrEqual(1000);
  });
});

describe("improvementDelta", () => {
  const h = (perfs: number[]) =>
    perfs.map((performance, i) => ({ contestId: `c${i}`, performance, rank: 1 }));

  it("latest vs trailing-k average", () => {
    // trailing 3 of [800, 900, 1000] avg = 900; latest 1500 → +600
    expect(improvementDelta(h([800, 900, 1000, 1500]), 3)).toBe(600);
  });
  it("uses only the trailing k, not all history", () => {
    // history [2000, 500, 500, 500, 1100]: trailing 3 = 500s → +600
    expect(improvementDelta(h([2000, 500, 500, 500, 1100]), 3)).toBe(600);
  });
  it("handles fewer than k prior contests", () => {
    expect(improvementDelta(h([1000, 1400]), 3)).toBe(400);
  });
  it("null with no prior history", () => {
    expect(improvementDelta(h([1500]), 3)).toBeNull();
    expect(improvementDelta([], 3)).toBeNull();
  });
  it("negative delta for a slump", () => {
    expect(improvementDelta(h([1500, 1500, 600]), 3)).toBe(-900);
  });
  it("respects minHistory", () => {
    expect(improvementDelta(h([1000, 1200]), 3, 2)).toBeNull();
    expect(improvementDelta(h([1000, 1100, 1200]), 3, 2)).toBe(150);
  });
});
