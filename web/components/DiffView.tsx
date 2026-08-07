"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { lineDiff } from "@/lib/diff";

interface FullSubmission {
  id: string;
  source?: string;
  language: string;
  createdAt: string;
  verdict: string;
}

export function DiffView({ idA, idB, onClose }: { idA: string; idB: string; onClose: () => void }) {
  const [a, setA] = useState<FullSubmission | null>(null);
  const [b, setB] = useState<FullSubmission | null>(null);

  useEffect(() => {
    api<FullSubmission>(`/submissions/${idA}`).then(setA);
    api<FullSubmission>(`/submissions/${idB}`).then(setB);
  }, [idA, idB]);

  if (!a || !b) return <p className="text-sm text-neutral-500">Loading diff…</p>;

  const [older, newer] =
    new Date(a.createdAt) <= new Date(b.createdAt) ? [a, b] : [b, a];
  const diff = lineDiff(older.source ?? "", newer.source ?? "");
  const changed = diff.filter((d) => d.kind !== "same").length;

  return (
    <div className="rounded border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-3 border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900">
        <span>
          Diff: {new Date(older.createdAt).toLocaleTimeString()} ({older.verdict}) →{" "}
          {new Date(newer.createdAt).toLocaleTimeString()} ({newer.verdict}) · {changed} changed lines
        </span>
        <button onClick={onClose} className="ml-auto text-neutral-500 hover:underline">
          close
        </button>
      </div>
      <pre className="max-h-80 overflow-auto p-0 text-xs leading-5">
        {diff.map((d, i) => (
          <div
            key={i}
            className={
              d.kind === "added"
                ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300"
                : d.kind === "removed"
                  ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300"
                  : ""
            }
          >
            <span className="inline-block w-6 select-none text-neutral-400">
              {d.kind === "added" ? "+" : d.kind === "removed" ? "−" : " "}
            </span>
            {d.text || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}
