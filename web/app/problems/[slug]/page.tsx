"use client";

import { use, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { api } from "@/lib/api";
import type { ProblemDetail } from "@/lib/types";
import { CodePanel } from "@/components/CodePanel";
import { Discussion } from "@/components/Discussion";

const DIFF = ["", "Intro", "Easy", "Medium", "Hard", "Expert"];

export default function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ProblemDetail>(`/problems/${slug}`).then(setProblem).catch((e) => setError(e.message));
  }, [slug]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!problem) return <p className="text-neutral-500">Loading…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h1 className="mb-1 text-2xl font-bold">{problem.title}</h1>
        <p className="mb-4 text-sm text-neutral-500">
          {DIFF[problem.difficulty]} · {problem.tags.join(", ")} · {problem.timeLimit}s ·{" "}
          {Math.round(problem.memLimit / 1024)} MB
        </p>
        <article className="prose prose-neutral max-w-none text-sm dark:prose-invert [&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1 dark:[&_code]:bg-neutral-900">
          <ReactMarkdown>{problem.statementMd}</ReactMarkdown>
        </article>

        {problem.testCases.length > 0 && (
          <div className="mt-6 space-y-3">
            <h2 className="font-semibold">Sample cases</h2>
            {problem.testCases.map((tc) => (
              <div key={tc.ordinal} className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="mb-1 text-neutral-500">Input {tc.ordinal}</p>
                  <pre className="max-h-40 overflow-auto rounded bg-neutral-100 p-2 dark:bg-neutral-900">{tc.input}</pre>
                </div>
                <div>
                  <p className="mb-1 text-neutral-500">Output {tc.ordinal}</p>
                  <pre className="max-h-40 overflow-auto rounded bg-neutral-100 p-2 dark:bg-neutral-900">{tc.expectedOutput}</pre>
                </div>
              </div>
            ))}
          </div>
        )}

        {problem.editorial && (
          <details className="mt-6">
            <summary className="cursor-pointer font-semibold">Editorial</summary>
            <article className="prose prose-neutral mt-2 max-w-none text-sm dark:prose-invert">
              <ReactMarkdown>{problem.editorial}</ReactMarkdown>
            </article>
          </details>
        )}

        <Discussion problemId={problem.id} />
      </div>

      <div>
        <CodePanel problemId={problem.id} contestId={problem.activeContestId} />
      </div>
    </div>
  );
}
