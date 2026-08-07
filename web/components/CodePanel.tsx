"use client";

/**
 * Editor + run/submit + verdict panel used on the problem page.
 * Run = sample cases only (unscored). Submit = full hidden suite, scored.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import type { SubmissionDetail, SubmissionListItem } from "@/lib/types";
import { VerdictBadge } from "./VerdictBadge";
import { DiffView } from "./DiffView";

const Monaco = dynamic(
  () =>
    import("@monaco-editor/react").then((m) => {
      // Self-hosted Monaco assets (no CDN — restricted networks must work)
      m.loader.config({ paths: { vs: "/monaco/vs" } });
      return m.default;
    }),
  { ssr: false }
);

const TEMPLATES: Record<string, string> = {
  cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // your code\n    return 0;\n}\n`,
  c: `#include <stdio.h>\n\nint main(void) {\n    /* your code */\n    return 0;\n}\n`,
  java: `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // your code\n    }\n}\n`,
  python: `import sys\ninput = sys.stdin.readline\n\n# your code\n`,
  javascript: `const lines = require("fs").readFileSync(0, "utf8").split("\\n");\n// your code\n`,
};

const MONACO_LANG: Record<string, string> = {
  cpp: "cpp", c: "c", java: "java", python: "python", javascript: "javascript",
};

export function CodePanel({ problemId, contestId }: { problemId: string; contestId?: string | null }) {
  const [languages, setLanguages] = useState<{ key: string; label: string }[]>([]);
  const [language, setLanguage] = useState("cpp");
  const [source, setSource] = useState(TEMPLATES.cpp);
  const [dark, setDark] = useState(true);
  const [busy, setBusy] = useState<"run" | "submit" | null>(null);
  const [result, setResult] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SubmissionListItem[]>([]);
  const [diffPick, setDiffPick] = useState<string[]>([]);
  const [diffPair, setDiffPair] = useState<[string, string] | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touched = useRef(false);

  useEffect(() => {
    api<{ key: string; label: string }[]>("/languages").then(setLanguages);
    refreshHistory();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshHistory = () =>
    api<SubmissionListItem[]>(`/submissions?problemId=${problemId}`).then(setHistory);

  const changeLanguage = (key: string) => {
    setLanguage(key);
    if (!touched.current) setSource(TEMPLATES[key] ?? "");
  };

  const poll = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const sub = await api<SubmissionDetail>(`/submissions/${id}`);
      setResult(sub);
      if (sub.verdict !== "PENDING" && sub.verdict !== "RUNNING") {
        if (pollRef.current) clearInterval(pollRef.current);
        setBusy(null);
        refreshHistory();
      }
    }, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async (mode: "run" | "submit") => {
    setBusy(mode);
    setError(null);
    setResult(null);
    try {
      const res = await api<{ id: string; position: number }>("/submissions", {
        method: "POST",
        body: { problemId, contestId: contestId ?? undefined, language, source, mode },
      });
      poll(res.id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <select
          value={language}
          onChange={(e) => changeLanguage(e.target.value)}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {(languages.length ? languages : Object.keys(TEMPLATES).map((key) => ({ key, label: key }))).map((l) => (
            <option key={l.key} value={l.key}>{l.label}</option>
          ))}
        </select>
        <button onClick={() => setDark(!dark)} className="text-sm text-neutral-500 hover:underline">
          {dark ? "Light" : "Dark"} theme
        </button>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => send("run")}
            disabled={busy !== null}
            className="rounded border border-neutral-300 px-4 py-1.5 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {busy === "run" ? "Running…" : "▷ Run samples"}
          </button>
          <button
            onClick={() => send("submit")}
            disabled={busy !== null}
            className="rounded bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {busy === "submit" ? "Judging…" : "Submit"}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded border border-neutral-300 dark:border-neutral-700">
        <Monaco
          height="420px"
          language={MONACO_LANG[language] ?? "plaintext"}
          value={source}
          theme={dark ? "vs-dark" : "light"}
          onChange={(v) => { touched.current = true; setSource(v ?? ""); }}
          options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false }}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
          <div className="mb-2 flex items-center gap-3">
            <VerdictBadge verdict={result.verdict} />
            {result.verdict === "PENDING" && result.position > 0 && (
              <span className="text-neutral-500">position in queue: {result.position}</span>
            )}
            {result.maxScore > 0 && (
              <span className="font-medium">{result.score}/{result.maxScore} pts</span>
            )}
            {result.execTimeMs !== null && <span className="text-neutral-500">{result.execTimeMs} ms</span>}
          </div>
          {result.compileOutput && (
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-neutral-100 p-2 text-xs text-red-700 dark:bg-neutral-900 dark:text-red-400">
              {result.compileOutput}
            </pre>
          )}
          {result.results.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {result.results.map((r, i) => (
                <span
                  key={i}
                  title={`${r.kind.toLowerCase()} #${r.ordinal}${r.timeMs !== null ? ` · ${r.timeMs}ms` : ""}`}
                  className={`rounded px-2 py-0.5 text-xs font-mono ${
                    r.verdict === "AC"
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                  }`}
                >
                  {r.kind === "SAMPLE" ? "s" : "h"}{r.ordinal}:{r.verdict}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <details className="text-sm" open={diffPair !== null}>
          <summary className="cursor-pointer text-neutral-500">
            My submissions ({history.length})
            {history.length > 1 && (
              <span className="ml-2 text-xs">— tick two to compare</span>
            )}
          </summary>
          {diffPair && <div className="mt-2"><DiffView idA={diffPair[0]} idB={diffPair[1]} onClose={() => setDiffPair(null)} /></div>}
          <table className="mt-2 w-full">
            <tbody>
              {history.map((s) => (
                <tr key={s.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-1.5 pr-2">
                    <input
                      type="checkbox"
                      checked={diffPick.includes(s.id)}
                      onChange={() => {
                        const next = diffPick.includes(s.id)
                          ? diffPick.filter((x) => x !== s.id)
                          : [...diffPick.slice(-1), s.id];
                        setDiffPick(next);
                        setDiffPair(next.length === 2 ? [next[0], next[1]] : null);
                      }}
                    />
                  </td>
                  <td className="py-1.5 pr-3"><VerdictBadge verdict={s.verdict} /></td>
                  <td className="py-1.5 pr-3">{s.language}</td>
                  <td className="py-1.5 pr-3">{s.maxScore > 0 ? `${s.score}/${s.maxScore}` : "—"}</td>
                  <td className="py-1.5 pr-3 text-neutral-500">{s.execTimeMs !== null ? `${s.execTimeMs} ms` : ""}</td>
                  <td className="py-1.5 text-neutral-500">{new Date(s.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
