"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { api } from "@/lib/api";
import type { QuizPaper } from "@/lib/types";

export function QuizPanel({ contestId, ended }: { contestId: string; ended: boolean }) {
  const [paper, setPaper] = useState<QuizPaper | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[] | string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<QuizPaper>(`/contests/${contestId}/quiz`).then(setPaper).catch((e) => setError(e.message));
  }, [contestId]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!paper) return <p className="text-neutral-500">Loading quiz…</p>;

  const toggle = (qid: string, oid: string, multi: boolean) => {
    setAnswers((prev) => {
      const cur = (prev[qid] as string[] | undefined) ?? [];
      if (!multi) return { ...prev, [qid]: [oid] };
      return {
        ...prev,
        [qid]: cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid],
      };
    });
  };

  const submit = async () => {
    if (!window.confirm("Submit quiz? You only get one attempt.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ score: number; maxScore: number }>(
        `/contests/${contestId}/quiz/submit`,
        { method: "POST", body: { answers } }
      );
      setPaper({ ...paper, submitted: true, score: res.score, maxScore: res.maxScore });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (paper.submitted) {
    const statusFor = (qid: string) =>
      paper.breakdown?.find((b) => b.questionId === qid)?.status;
    return (
      <div>
        <div className="mb-4 rounded-lg border border-green-300 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
          <p className="text-lg font-semibold">
            Quiz submitted — {paper.score}/{paper.maxScore} marks
          </p>
        </div>
        <ol className="space-y-3">
          {paper.questions.map((q, i) => (
            <li key={q.id} className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
              <span className="mr-2 font-mono text-neutral-400">Q{i + 1}</span>
              <span
                className={
                  statusFor(q.id) === "correct"
                    ? "text-green-600"
                    : statusFor(q.id) === "wrong"
                      ? "text-red-600"
                      : "text-neutral-500"
                }
              >
                {statusFor(q.id) ?? "—"}
              </span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (ended) {
    return <p className="text-neutral-500">The contest ended before you submitted the quiz.</p>;
  }

  return (
    <div className="space-y-6">
      {paper.questions.map((q, i) => (
        <div key={q.id} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="font-mono text-sm text-neutral-400">Q{i + 1}</span>
            <span className="text-xs text-neutral-500">
              +{q.marks}{q.negativeMarks > 0 ? ` / −${q.negativeMarks}` : ""} marks
              {q.kind === "MULTI" ? " · select all that apply" : ""}
            </span>
          </div>
          <article className="prose prose-neutral mb-3 max-w-none text-sm dark:prose-invert">
            <ReactMarkdown>{q.promptMd}</ReactMarkdown>
          </article>
          {q.codeMd && (
            <pre className="mb-3 overflow-auto rounded bg-neutral-100 p-3 text-xs dark:bg-neutral-900">
              {q.codeMd}
            </pre>
          )}
          {q.kind === "NUMERIC" ? (
            <input
              type="number"
              step="any"
              placeholder="Your answer"
              className="w-48 rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              value={(answers[q.id] as string) ?? ""}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            />
          ) : (
            <div className="space-y-1.5">
              {q.options.map((o) => {
                const selected = ((answers[q.id] as string[]) ?? []).includes(o.id);
                return (
                  <label
                    key={o.id}
                    className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm ${
                      selected
                        ? "border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950"
                        : "border-neutral-200 dark:border-neutral-800"
                    }`}
                  >
                    <input
                      type={q.kind === "MULTI" ? "checkbox" : "radio"}
                      name={q.id}
                      checked={selected}
                      onChange={() => toggle(q.id, o.id, q.kind === "MULTI")}
                    />
                    {o.text}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={busy}
        className="rounded bg-green-600 px-6 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit quiz (one attempt)"}
      </button>
    </div>
  );
}
