"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Profile {
  user: { name: string; externalId: string | null; group: { name: string } | null };
  stats: {
    solvedTotal: number;
    contestsPlayed: number;
    bestRank: number | null;
    currentStreakDays: number;
    maxStreakDays: number;
  };
  byDifficulty: Record<string, number>;
  byTag: Record<string, number>;
  badges: { id: string; label: string; emoji: string }[];
  ratingHistory: {
    contestId: string;
    ratingAfter: number;
    performance: number;
    rank: number;
    contest: { title: string; endsAt: string };
  }[];
  currentRating: number | null;
}

const DIFF = ["", "Intro", "Easy", "Medium", "Hard", "Expert"];

function RatingSparkline({ history }: { history: Profile["ratingHistory"] }) {
  if (history.length < 2) return null;
  const values = history.map((h) => h.ratingAfter);
  const min = Math.min(...values) - 20;
  const max = Math.max(...values) + 20;
  const W = 320;
  const H = 64;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * W},${H - ((v - min) / (max - min)) * H}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-16 w-full max-w-xs">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500" />
    </svg>
  );
}

export default function ProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Profile>("/profile/me").then(setP).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!p) return <p className="text-neutral-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">{p.user.name}</h1>
      <p className="text-sm text-neutral-500">
        {p.user.externalId && <span>{p.user.externalId} · </span>}
        {p.user.group?.name ?? "no group"}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Solved", p.stats.solvedTotal],
          ["Contests", p.stats.contestsPlayed],
          ["Rating", p.currentRating ?? "—"],
          ["Streak", `${p.stats.currentStreakDays}d (max ${p.stats.maxStreakDays})`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-neutral-200 p-3 text-center dark:border-neutral-800">
            <p className="text-xl font-bold">{value}</p>
            <p className="text-xs text-neutral-500">{label}</p>
          </div>
        ))}
      </div>

      {p.badges.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 font-semibold">Badges</h2>
          <div className="flex flex-wrap gap-2">
            {p.badges.map((b) => (
              <span key={b.id} className="rounded-full border border-neutral-200 px-3 py-1 text-sm dark:border-neutral-800">
                {b.emoji} {b.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {p.ratingHistory.length > 0 && (
        <div className="mt-6">
          <h2 className="font-semibold">Rating trend</h2>
          <RatingSparkline history={p.ratingHistory} />
          <table className="mt-2 w-full text-sm">
            <tbody>
              {[...p.ratingHistory].reverse().slice(0, 10).map((h) => (
                <tr key={h.contestId} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-1.5 pr-3">{h.contest.title}</td>
                  <td className="py-1.5 pr-3 text-neutral-500">rank {h.rank}</td>
                  <td className="py-1.5 text-right font-mono">{h.ratingAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 font-semibold">By difficulty</h2>
          {Object.entries(p.byDifficulty).map(([d, n]) => (
            <p key={d} className="text-sm">
              {DIFF[Number(d)]}: <span className="font-medium">{n}</span>
            </p>
          ))}
          {Object.keys(p.byDifficulty).length === 0 && (
            <p className="text-sm text-neutral-500">Nothing solved yet.</p>
          )}
        </div>
        <div>
          <h2 className="mb-2 font-semibold">By tag</h2>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(p.byTag)
              .sort((a, b) => b[1] - a[1])
              .map(([tag, n]) => (
                <span key={tag} className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-900">
                  {tag} × {n}
                </span>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
