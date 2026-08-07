import { describe, it, expect } from "vitest";
import { gradeAttempt, seededShuffle, type QuizQuestionSpec } from "../src/quiz/grade.js";

const q = (over: Partial<QuizQuestionSpec> & { id: string }): QuizQuestionSpec => ({
  kind: "SINGLE",
  marks: 4,
  negativeMarks: 1,
  answer: ["a"],
  ...over,
});

describe("gradeAttempt", () => {
  it("SINGLE: correct earns marks, wrong costs negative", () => {
    const qs = [q({ id: "q1" }), q({ id: "q2" })];
    const r = gradeAttempt(qs, { q1: ["a"], q2: ["b"] });
    expect(r.score).toBe(4 - 1);
    expect(r.maxScore).toBe(8);
    expect(r.breakdown.map((b) => b.status)).toEqual(["correct", "wrong"]);
  });

  it("unanswered scores 0, never negative", () => {
    const r = gradeAttempt([q({ id: "q1" })], {});
    expect(r.score).toBe(0);
    expect(r.breakdown[0].status).toBe("unanswered");
  });

  it("empty selection counts as unanswered", () => {
    const r = gradeAttempt([q({ id: "q1" })], { q1: [] });
    expect(r.breakdown[0].status).toBe("unanswered");
  });

  it("MULTI: exact set required, order-insensitive", () => {
    const qs = [q({ id: "m1", kind: "MULTI", answer: ["a", "c"] })];
    expect(gradeAttempt(qs, { m1: ["c", "a"] }).score).toBe(4);
    expect(gradeAttempt(qs, { m1: ["a"] }).score).toBe(-1); // incomplete = wrong
    expect(gradeAttempt(qs, { m1: ["a", "b", "c"] }).score).toBe(-1); // extra = wrong
  });

  it("NUMERIC: tolerance respected, string input coerced", () => {
    const qs = [q({ id: "n1", kind: "NUMERIC", answer: { value: 3.14, tolerance: 0.01 } })];
    expect(gradeAttempt(qs, { n1: 3.15 }).score).toBe(4);
    expect(gradeAttempt(qs, { n1: 3.2 }).score).toBe(-1);
    expect(gradeAttempt(qs, { n1: "3.14" as unknown as number }).score).toBe(4);
  });

  it("NUMERIC: garbage input is wrong, not crash", () => {
    const qs = [q({ id: "n1", kind: "NUMERIC", answer: { value: 5, tolerance: 0 } })];
    expect(gradeAttempt(qs, { n1: "abc" as unknown as number }).score).toBe(-1);
  });

  it("CODE_OUTPUT behaves like SINGLE", () => {
    const qs = [q({ id: "c1", kind: "CODE_OUTPUT", answer: ["opt2"], negativeMarks: 2 })];
    expect(gradeAttempt(qs, { c1: ["opt2"] }).score).toBe(4);
    expect(gradeAttempt(qs, { c1: ["opt1"] }).score).toBe(-2);
  });

  it("total can go negative with heavy negative marking", () => {
    const qs = [q({ id: "q1", negativeMarks: 5 }), q({ id: "q2", negativeMarks: 5 })];
    expect(gradeAttempt(qs, { q1: ["x"], q2: ["y"] }).score).toBe(-10);
  });

  it("zero negative marking never penalizes", () => {
    const qs = [q({ id: "q1", negativeMarks: 0 })];
    expect(gradeAttempt(qs, { q1: ["nope"] }).score).toBe(0);
  });
});

describe("seededShuffle", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("deterministic for the same seed", () => {
    expect(seededShuffle(items, "user1|contest1")).toEqual(seededShuffle(items, "user1|contest1"));
  });
  it("different users get different orders (with high probability)", () => {
    const orders = new Set(
      ["u1", "u2", "u3", "u4", "u5"].map((u) => seededShuffle(items, u).join(""))
    );
    expect(orders.size).toBeGreaterThan(3);
  });
  it("is a permutation — nothing lost or duplicated", () => {
    const out = seededShuffle(items, "seed");
    expect([...out].sort()).toEqual([...items].sort());
  });
  it("does not mutate input", () => {
    const copy = [...items];
    seededShuffle(items, "x");
    expect(items).toEqual(copy);
  });
});
