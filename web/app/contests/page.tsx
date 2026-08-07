"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ContestListItem } from "@/lib/types";
import { Countdown } from "@/components/Countdown";

function status(c: ContestListItem): "upcoming" | "running" | "ended" {
  const now = Date.now();
  if (now < new Date(c.startsAt).getTime()) return "upcoming";
  if (now < new Date(c.endsAt).getTime()) return "running";
  return "ended";
}

export default function ContestsPage() {
  const [contests, setContests] = useState<ContestListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<ContestListItem[]>("/contests")
      .then(setContests)
      .catch(() => setError("Can't reach the server — is the API running?"));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;

  const sections: ["running" | "upcoming" | "ended", string][] = [
    ["running", "Live now"],
    ["upcoming", "Upcoming"],
    ["ended", "Past contests"],
  ];

  return (
    <div className="space-y-8">
      {sections.map(([key, label]) => {
        const list = contests.filter((c) => status(c) === key);
        if (list.length === 0) return null;
        return (
          <section key={key}>
            <h2 className="mb-3 text-xl font-bold">{label}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {list.map((c) => (
                <Link
                  key={c.id}
                  href={`/contests/${c.id}`}
                  className={`rounded-lg border p-4 hover:shadow ${
                    key === "running"
                      ? "border-green-400 bg-green-50 dark:border-green-700 dark:bg-green-950"
                      : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                  }`}
                >
                  <h3 className="font-semibold">{c.title}</h3>
                  <p className="mt-1 text-sm text-neutral-500">
                    {c._count.problems} problems · {c.scoringMode.toLowerCase()} scoring
                  </p>
                  <p className="mt-2 text-sm">
                    {key === "upcoming" && (
                      <>starts in <Countdown to={c.startsAt} /></>
                    )}
                    {key === "running" && (
                      <>ends in <Countdown to={c.endsAt} /></>
                    )}
                    {key === "ended" && new Date(c.endsAt).toLocaleString()}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
      {contests.length === 0 && <p className="text-neutral-500">No contests yet.</p>}
    </div>
  );
}
