/** Minimal line-level LCS diff for the attempt-comparison view. */

export interface DiffLine {
  kind: "same" | "added" | "removed";
  text: string;
}

export function lineDiff(a: string, b: string): DiffLine[] {
  const A = a.split("\n");
  const B = b.split("\n");
  const n = A.length;
  const m = B.length;

  // LCS table (fine for source files of a few thousand lines)
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ kind: "same", text: A[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "removed", text: A[i] });
      i++;
    } else {
      out.push({ kind: "added", text: B[j] });
      j++;
    }
  }
  while (i < n) out.push({ kind: "removed", text: A[i++] });
  while (j < m) out.push({ kind: "added", text: B[j++] });
  return out;
}
