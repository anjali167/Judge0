import { describe, it, expect } from "vitest";
import {
  scoreSubmission,
  overallVerdict,
  effectiveTimeLimit,
  type JudgedCase,
} from "../src/scoring/score.js";

const h = (verdict: JudgedCase["verdict"], weight = 1): JudgedCase => ({
  kind: "HIDDEN",
  weight,
  verdict,
});
const s = (verdict: JudgedCase["verdict"]): JudgedCase => ({
  kind: "SAMPLE",
  weight: 0,
  verdict,
});

describe("scoreSubmission — PARTIAL", () => {
  it("full points when all hidden pass", () => {
    expect(scoreSubmission([h("AC"), h("AC")], "PARTIAL", 100)).toEqual({
      score: 100,
      maxScore: 100,
    });
  });

  it("proportional to passed weights", () => {
    expect(
      scoreSubmission([h("AC", 3), h("WA", 1), h("AC", 1)], "PARTIAL", 100).score
    ).toBe(80); // 4/5 of 100
  });

  it("floors fractional scores (never rounds up to full)", () => {
    // 2/3 of 100 = 66.67 -> 66
    expect(scoreSubmission([h("AC"), h("AC"), h("WA")], "PARTIAL", 100).score).toBe(66);
  });

  it("zero when nothing passes", () => {
    expect(scoreSubmission([h("WA"), h("TLE")], "PARTIAL", 100).score).toBe(0);
  });

  it("sample cases never contribute to score", () => {
    expect(scoreSubmission([s("AC"), h("WA")], "PARTIAL", 100).score).toBe(0);
    expect(scoreSubmission([s("WA"), h("AC")], "PARTIAL", 100).score).toBe(100);
  });

  it("unequal weights: heavy case dominates", () => {
    expect(
      scoreSubmission([h("AC", 9), h("WA", 1)], "PARTIAL", 50).score
    ).toBe(45);
  });

  it("no hidden cases -> zero score, never divide-by-zero", () => {
    expect(scoreSubmission([s("AC")], "PARTIAL", 100).score).toBe(0);
    expect(scoreSubmission([], "PARTIAL", 100).score).toBe(0);
  });

  it("zero points contest problem", () => {
    expect(scoreSubmission([h("AC")], "PARTIAL", 0).score).toBe(0);
  });
});

describe("scoreSubmission — BINARY", () => {
  it("all-or-nothing: one WA kills the score", () => {
    expect(scoreSubmission([h("AC", 5), h("WA", 1)], "BINARY", 100).score).toBe(0);
  });
  it("full points when clean", () => {
    expect(scoreSubmission([h("AC"), h("AC")], "BINARY", 100).score).toBe(100);
  });
  it("TLE/MLE/RE also kill binary score", () => {
    for (const v of ["TLE", "MLE", "RE", "CE"] as const) {
      expect(scoreSubmission([h("AC"), h(v)], "BINARY", 100).score).toBe(0);
    }
  });
});

describe("overallVerdict", () => {
  it("AC when everything passes", () => {
    expect(overallVerdict([h("AC"), s("AC")])).toBe("AC");
  });
  it("CE dominates everything", () => {
    expect(overallVerdict([h("AC"), h("WA"), h("CE")])).toBe("CE");
  });
  it("precedence: RE > MLE > TLE > WA", () => {
    expect(overallVerdict([h("WA"), h("TLE")])).toBe("TLE");
    expect(overallVerdict([h("TLE"), h("MLE")])).toBe("MLE");
    expect(overallVerdict([h("MLE"), h("RE")])).toBe("RE");
    expect(overallVerdict([h("WA"), h("AC")])).toBe("WA");
  });
  it("empty case list is an internal error", () => {
    expect(overallVerdict([])).toBe("IE");
  });
});

describe("effectiveTimeLimit", () => {
  it("C/C++ get base limit", () => {
    expect(effectiveTimeLimit(2, "cpp")).toBe(2);
    expect(effectiveTimeLimit(2, "c")).toBe(2);
  });
  it("Python/JS get 3x, Java 2x", () => {
    expect(effectiveTimeLimit(2, "python")).toBe(6);
    expect(effectiveTimeLimit(2, "javascript")).toBe(6);
    expect(effectiveTimeLimit(2, "java")).toBe(4);
  });
  it("unknown language defaults to 3x; capped at 20s", () => {
    expect(effectiveTimeLimit(2, "ruby")).toBe(6);
    expect(effectiveTimeLimit(10, "python")).toBe(20);
  });
});
