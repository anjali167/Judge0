"use client";

/**
 * Public read-only leaderboard (spec 5.5): no login, shareable/projectable.
 * Polls every 10 seconds.
 */
import { use, useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import type { LeaderboardPayload } from "@/lib/types";

interface PublicPayload {
  contest: {
    title: string;
    startsAt: string;
    endsAt: string;
    hasQuiz: boolean;
    problems: { id: string; title: string; order: number }[];
  };
  leaderboard: LeaderboardPayload;
}

export default function PublicLeaderboardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<PublicPayload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch(`${API_URL}/public/contests/${token}/leaderboard`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then(setData)
        .catch(() => setError(true));
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [token]);

  if (error) return <p className="mt-16 text-center text-neutral-500">Leaderboard not found.</p>;
  if (!data) return <p className="mt-16 text-center text-neutral-500">Loading…</p>;

  const problems = [...data.contest.problems].sort((a, b) => a.order - b.order);
  const items: { id: string; label: string; title: string }[] = [
    ...problems.map((p, i) => ({ id: p.id, label: String.fromCharCode(65 + i), title: p.title })),
    ...(data.contest.hasQuiz ? [{ id: "quiz", label: "Quiz", title: "Quiz round" }] : []),
  ];
  const ended = Date.now() > new Date(data.contest.endsAt).getTime();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold">{data.contest.title}</h1>
        <p className="mt-1 text-neutral-500">
          {ended ? "Final standings" : "Live standings"}
          {data.leaderboard.frozen && (
            <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              ❄ FROZEN
            </span>
          )}
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-neutral-100 text-left dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 w-12">#</th>
              <th className="px-3 py-2">Participant</th>
              <th className="px-3 py-2">Group</th>
              {items.map((it) => (
                <th key={it.id} className="px-3 py-2 text-center" title={it.title}>
                  {it.label}
                </th>
              ))}
              <th className="px-3 py-2 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {data.leaderboard.rows.map((r) => (
              <tr key={r.userId} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="px-3 py-2 font-mono">{r.rank}</td>
                <td className="px-3 py-2 font-medium">
                  {r.name}
                  {r.externalId && <span className="ml-2 text-xs text-neutral-500">{r.externalId}</span>}
                </td>
                <td className="px-3 py-2 text-neutral-500">{r.groupName ?? "—"}</td>
                {items.map((it) => {
                  const cell = r.problems[it.id];
                  return (
                    <td key={it.id} className="px-3 py-2 text-center">
                      {cell ? (
                        <span
                          className={
                            cell.solved
                              ? "font-semibold text-green-600 dark:text-green-400"
                              : cell.bestScore > 0
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-red-500"
                          }
                        >
                          {cell.bestScore}
                        </span>
                      ) : (
                        <span className="text-neutral-300 dark:text-neutral-700">·</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right font-semibold">{r.totalScore}</td>
              </tr>
            ))}
            {data.leaderboard.rows.length === 0 && (
              <tr>
                <td colSpan={4 + items.length} className="px-3 py-10 text-center text-neutral-500">
                  No submissions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-center text-xs text-neutral-400">
        Updates every 10s · {new Date(data.leaderboard.generatedAt).toLocaleTimeString()}
      </p>
    </div>
  );
}
