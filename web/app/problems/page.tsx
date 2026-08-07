"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { ProblemListItem } from "@/lib/types";

const DIFF = ["", "Intro", "Easy", "Medium", "Hard", "Expert"];

export default function ProblemsPage() {
  const [problems, setProblems] = useState<ProblemListItem[]>([]);
  const [tag, setTag] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api<ProblemListItem[]>("/problems")
      .then((p) => {
        setProblems(p);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const tags = useMemo(
    () => Array.from(new Set(problems.flatMap((p) => p.tags))).sort(),
    [problems]
  );
  const filtered = problems.filter(
    (p) =>
      (!tag || p.tags.includes(tag)) &&
      (!difficulty || p.difficulty === Number(difficulty))
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Practice archive</h1>
        <div className="ml-auto flex gap-2 text-sm">
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="">Any difficulty</option>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>{DIFF[d]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-100 text-left dark:bg-neutral-900">
            <tr>
              <th className="px-4 py-2 w-8"></th>
              <th className="px-4 py-2">Problem</th>
              <th className="px-4 py-2">Difficulty</th>
              <th className="px-4 py-2">Tags</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
                <td className="px-4 py-2">{p.solved ? "✅" : ""}</td>
                <td className="px-4 py-2">
                  <Link href={`/problems/${p.slug}`} className="font-medium hover:underline">
                    {p.title}
                  </Link>
                </td>
                <td className="px-4 py-2">{DIFF[p.difficulty]}</td>
                <td className="px-4 py-2 text-neutral-500">{p.tags.join(", ")}</td>
              </tr>
            ))}
            {loaded && filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-neutral-500">No problems match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
