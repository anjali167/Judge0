import { describe, it, expect } from "vitest";
import {
  computeStandings,
  foldProblem,
  freezeCutoff,
  type StandingSubmission,
  type ContestInfo,
} from "../src/leaderboard/standings.js";

const T0 = new Date("2026-08-09T10:00:00Z");
const contest: ContestInfo = { startsAt: T0, wrongPenaltyMin: 10 };
const at = (min: number) => new Date(T0.getTime() + min * 60000);

const sub = (
  userId: string,
  problemId: string,
  score: number,
  minute: number,
  opts: Partial<StandingSubmission> = {}
): StandingSubmission => ({
  userId,
  problemId,
  score,
  maxScore: 100,
  createdAt: at(minute),
  verdict: score === 100 ? "AC" : score > 0 ? "WA" : "WA",
  ...opts,
});

describe("foldProblem", () => {
  it("best score wins; first time it was achieved fixes the clock", () => {
    const cell = foldProblem(
      [sub("u1", "p1", 40, 10), sub("u1", "p1", 100, 30), sub("u1", "p1", 100, 50)],
      contest
    )!;
    expect(cell.bestScore).toBe(100);
    expect(cell.bestAtMin).toBe(30);
    expect(cell.solved).toBe(true);
  });

  it("counts wrong attempts before the best submission only", () => {
    const cell = foldProblem(
      [
        sub("u1", "p1", 0, 5),
        sub("u1", "p1", 0, 10),
        sub("u1", "p1", 100, 20),
        sub("u1", "p1", 0, 25), // after solve — no penalty
      ],
      contest
    )!;
    expect(cell.wrongBefore).toBe(2);
  });

  it("CE submissions are not penalized", () => {
    const cell = foldProblem(
      [
        sub("u1", "p1", 0, 5, { verdict: "CE" }),
        sub("u1", "p1", 0, 10),
        sub("u1", "p1", 100, 20),
      ],
      contest
    )!;
    expect(cell.wrongBefore).toBe(1);
  });

  it("unsolved: all non-CE attempts counted, no time", () => {
    const cell = foldProblem(
      [sub("u1", "p1", 0, 5), sub("u1", "p1", 0, 10, { verdict: "CE" })],
      contest
    )!;
    expect(cell.bestScore).toBe(0);
    expect(cell.bestAtMin).toBeNull();
    expect(cell.wrongBefore).toBe(1);
    expect(cell.solved).toBe(false);
  });

  it("partial best score still accrues penalty time", () => {
    const cell = foldProblem(
      [sub("u1", "p1", 0, 5), sub("u1", "p1", 60, 40)],
      contest
    )!;
    expect(cell.bestScore).toBe(60);
    expect(cell.bestAtMin).toBe(40);
    expect(cell.wrongBefore).toBe(1);
    expect(cell.solved).toBe(false);
  });

  it("out-of-order input is sorted by time", () => {
    const cell = foldProblem(
      [sub("u1", "p1", 100, 30), sub("u1", "p1", 0, 5)],
      contest
    )!;
    expect(cell.wrongBefore).toBe(1);
    expect(cell.bestAtMin).toBe(30);
  });
});

describe("computeStandings — ordering", () => {
  it("higher total score ranks first", () => {
    const rows = computeStandings(
      [sub("alice", "p1", 100, 30), sub("bob", "p1", 60, 10)],
      contest
    );
    expect(rows.map((r) => r.userId)).toEqual(["alice", "bob"]);
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
  });

  it("equal score: lower penalty wins", () => {
    const rows = computeStandings(
      [
        // alice: solves at 30, one wrong -> 30 + 10 = 40 penalty
        sub("alice", "p1", 0, 10),
        sub("alice", "p1", 100, 30),
        // bob: solves at 35, clean -> 35 penalty
        sub("bob", "p1", 100, 35),
      ],
      contest
    );
    expect(rows.map((r) => r.userId)).toEqual(["bob", "alice"]);
  });

  it("penalty sums across problems", () => {
    const rows = computeStandings(
      [
        sub("alice", "p1", 100, 10),
        sub("alice", "p2", 100, 50),
        sub("bob", "p1", 100, 20),
        sub("bob", "p2", 100, 30),
      ],
      contest
    );
    // alice penalty 60, bob 50 — same score
    expect(rows.map((r) => r.userId)).toEqual(["bob", "alice"]);
    expect(rows[0].penaltyMin).toBe(50);
    expect(rows[1].penaltyMin).toBe(60);
  });

  it("full tie shares rank; next rank skips (1,2,2,4)", () => {
    const rows = computeStandings(
      [
        sub("a", "p1", 100, 10),
        sub("b", "p1", 100, 20),
        sub("c", "p1", 100, 20),
        sub("d", "p1", 60, 20),
      ],
      contest
    );
    // b and c: same score, same penalty, same last improvement time
    expect(rows[0].userId).toBe("a");
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
    expect(rows[2].rank).toBe(2);
    expect(rows[3].rank).toBe(4);
  });

  it("wrong attempts on an unsolved problem cost nothing", () => {
    const rows = computeStandings(
      [
        sub("alice", "p1", 100, 30),
        sub("alice", "p2", 0, 5),
        sub("alice", "p2", 0, 10),
        sub("bob", "p1", 100, 30),
      ],
      contest
    );
    expect(rows[0].penaltyMin).toBe(rows[1].penaltyMin);
    // tie broken deterministically (stable), both rank 1
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(1);
  });

  it("empty input -> empty standings", () => {
    expect(computeStandings([], contest)).toEqual([]);
  });

  it("participant with only zero-score submissions still appears", () => {
    const rows = computeStandings([sub("z", "p1", 0, 5)], contest);
    expect(rows).toHaveLength(1);
    expect(rows[0].totalScore).toBe(0);
    expect(rows[0].penaltyMin).toBe(0);
  });

  it("deterministic ordering for identical rows (userId tiebreak)", () => {
    const rows = computeStandings(
      [sub("zed", "p1", 100, 10), sub("amy", "p1", 100, 10)],
      contest
    );
    expect(rows.map((r) => r.userId)).toEqual(["amy", "zed"]);
  });
});

describe("freezeCutoff", () => {
  const endsAt = new Date("2026-08-09T13:00:00Z");
  const c = (freezeMin: number) => ({ endsAt, freezeMin });
  const at = (iso: string) => new Date(iso);

  it("no freeze configured -> null", () => {
    expect(freezeCutoff(c(0), at("2026-08-09T12:59:00Z"))).toBeNull();
  });
  it("before the freeze window -> null", () => {
    expect(freezeCutoff(c(15), at("2026-08-09T12:44:59Z"))).toBeNull();
  });
  it("inside the freeze window -> cutoff at endsAt - freezeMin", () => {
    expect(freezeCutoff(c(15), at("2026-08-09T12:50:00Z"))).toEqual(
      at("2026-08-09T12:45:00Z")
    );
    // boundary: exactly at cutoff is frozen
    expect(freezeCutoff(c(15), at("2026-08-09T12:45:00Z"))).toEqual(
      at("2026-08-09T12:45:00Z")
    );
  });
  it("after the contest ends -> unfrozen (null)", () => {
    expect(freezeCutoff(c(15), at("2026-08-09T13:00:00Z"))).toBeNull();
    expect(freezeCutoff(c(15), at("2026-08-09T14:00:00Z"))).toBeNull();
  });
});
