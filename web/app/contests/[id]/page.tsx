"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ContestDetail } from "@/lib/types";
import { Countdown } from "@/components/Countdown";
import { Leaderboard } from "@/components/Leaderboard";

const DIFF = ["", "Intro", "Easy", "Medium", "Hard", "Expert"];

export default function ContestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [tab, setTab] = useState<"problems" | "leaderboard">("problems");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () => api<ContestDetail>(`/contests/${id}`).then(setContest).catch((e) => setError(e.message)),
    [id]
  );
  useEffect(() => { load(); }, [load]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!contest) return <p className="text-neutral-500">Loading…</p>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{contest.title}</h1>
        {contest.description && <p className="mt-1 text-neutral-500">{contest.description}</p>}
        <p className="mt-2 text-sm">
          {contest.status === "upcoming" && (
            <span className="text-lg">
              Starts in <Countdown to={contest.startsAt} onDone={load} />
            </span>
          )}
          {contest.status === "running" && (
            <span className="text-lg text-green-600 dark:text-green-400">
              Ends in <Countdown to={contest.endsAt} onDone={load} />
            </span>
          )}
          {contest.status === "ended" && (
            <span className="text-neutral-500">
              Ended {new Date(contest.endsAt).toLocaleString()} — problems are now in the practice archive
            </span>
          )}
        </p>
      </div>

      {contest.status === "upcoming" ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center text-neutral-500 dark:border-neutral-700">
          Problems are hidden until the contest starts.
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-1 rounded-lg bg-neutral-100 p-1 text-sm w-fit dark:bg-neutral-900">
            {(["problems", "leaderboard"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-4 py-1.5 capitalize ${tab === t ? "bg-white shadow dark:bg-neutral-700" : "text-neutral-500"}`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "problems" ? (
            <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-sm">
                <thead className="bg-neutral-100 text-left dark:bg-neutral-900">
                  <tr>
                    <th className="px-4 py-2 w-10">#</th>
                    <th className="px-4 py-2">Problem</th>
                    <th className="px-4 py-2">Difficulty</th>
                    <th className="px-4 py-2 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {contest.problems.map((p, i) => (
                    <tr key={p.id} className="border-t border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
                      <td className="px-4 py-2 font-mono">{String.fromCharCode(65 + i)}</td>
                      <td className="px-4 py-2">
                        <Link href={`/problems/${p.slug}`} className="font-medium hover:underline">
                          {p.title}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{DIFF[p.difficulty]}</td>
                      <td className="px-4 py-2 text-right">{p.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Leaderboard
              contestId={contest.id}
              problems={contest.problems.map((p) => ({ id: p.id, title: p.title, order: p.order }))}
            />
          )}
        </>
      )}
    </div>
  );
}
