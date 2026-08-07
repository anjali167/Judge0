import { describe, it, expect } from "vitest";
import {
  normalizeTokens,
  fingerprints,
  sourceSimilarity,
} from "../src/plagiarism/similarity.js";

const SOLUTION_A = `
#include <bits/stdc++.h>
using namespace std;
int main() {
    int n; cin >> n;
    vector<int> a(n);
    for (int i = 0; i < n; i++) cin >> a[i];
    long long best = 0, cur = 0;
    for (int i = 0; i < n; i++) {
        cur = max((long long)a[i], cur + a[i]);
        best = max(best, cur);
    }
    cout << best << endl;
}
`;

// Same solution, renamed identifiers + different comments/whitespace
const SOLUTION_A_RENAMED = `
#include <bits/stdc++.h>
using namespace std;
int main() {
    // read the count first
    int count; cin >> count;
    vector<int> values(count);
    for (int idx = 0; idx < count; idx++) cin >> values[idx];
    long long answer = 0, running = 0; /* kadane */
    for (int idx = 0; idx < count; idx++) {
        running = max((long long)values[idx], running + values[idx]);
        answer = max(answer, running);
    }
    cout << answer << endl;
}
`;

// Genuinely different approach (prefix sums + min tracking)
const SOLUTION_B = `
#include <bits/stdc++.h>
using namespace std;
int main() {
    int n; cin >> n;
    long long prefix = 0, minPrefix = 0, best = LLONG_MIN;
    for (int i = 0; i < n; i++) {
        long long x; cin >> x;
        prefix += x;
        best = max(best, prefix - minPrefix);
        minPrefix = min(minPrefix, prefix);
    }
    cout << best << "\\n";
}
`;

const PY_SHORT = `a,b=map(int,input().split());print(a+b)`;

describe("normalizeTokens", () => {
  it("canonicalizes identifiers but keeps keywords", () => {
    const t = normalizeTokens("int foo = bar + 42;");
    expect(t).toEqual(["int", "V", "=", "V", "+", "N", ";"]);
  });
  it("strips comments and string literals", () => {
    const t = normalizeTokens('x = "hello world"; // comment\n/* block */ y = 2;');
    expect(t.join(" ")).not.toContain("hello");
    expect(t.join(" ")).not.toContain("comment");
    expect(t.join(" ")).not.toContain("block");
  });
  it("empty and whitespace-only sources", () => {
    expect(normalizeTokens("")).toEqual([]);
    expect(normalizeTokens("   \n\t ")).toEqual([]);
  });
});

describe("sourceSimilarity", () => {
  it("identical sources -> 1.0", () => {
    expect(sourceSimilarity(SOLUTION_A, SOLUTION_A)).toBe(1);
  });
  it("renamed-identifier copy -> very high similarity", () => {
    expect(sourceSimilarity(SOLUTION_A, SOLUTION_A_RENAMED)).toBeGreaterThan(0.8);
  });
  it("different algorithm -> clearly lower than a rename-copy", () => {
    const copied = sourceSimilarity(SOLUTION_A, SOLUTION_A_RENAMED);
    const different = sourceSimilarity(SOLUTION_A, SOLUTION_B);
    expect(different).toBeLessThan(copied - 0.3);
    expect(different).toBeLessThan(0.6);
  });
  it("symmetric", () => {
    expect(sourceSimilarity(SOLUTION_A, SOLUTION_B)).toBeCloseTo(
      sourceSimilarity(SOLUTION_B, SOLUTION_A),
      10
    );
  });
  it("tiny sources do not crash and match themselves", () => {
    expect(sourceSimilarity(PY_SHORT, PY_SHORT)).toBe(1);
    expect(sourceSimilarity("", SOLUTION_A)).toBe(0);
    expect(sourceSimilarity("", "")).toBe(0);
  });
});

describe("fingerprints", () => {
  it("deterministic", () => {
    const a = fingerprints(SOLUTION_A);
    const b = fingerprints(SOLUTION_A);
    expect([...a].sort()).toEqual([...b].sort());
  });
  it("winnowing guarantee: shared long block is detected", () => {
    const shared = SOLUTION_A;
    const wrapped = `int helper() { return 1; }\n${shared}\n// trailer`;
    expect(sourceSimilarity(shared, wrapped)).toBeGreaterThan(0.7);
  });
});
