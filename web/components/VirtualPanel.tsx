"use client";

/** Virtual participation controls on an ended contest (spec 5.3). */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Countdown } from "./Countdown";

interface VirtualState {
  started: boolean;
  startedAt?: string;
  virtualEndsAt?: string;
  running?: boolean;
}

interface Standing {
  me: { totalScore: number; penaltyMin: number } | null;
  wouldBeRank: number | null;
  officialSize: number;
}

export function VirtualPanel({ contestId }: { contestId: string }) {
  const [state, setState] = useState<VirtualState | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<VirtualState>(`/contests/${contestId}/virtual`).then((s) => {
      setState(s);
      if (s.started) {
        api<Standing>(`/contests/${contestId}/virtual/standing`).then(setStanding).catch(() => {});
      }
    });
  }, [contestId]);
  useEffect(load, [load]);

  if (!state) return null;

  if (!state.started) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        <span>
          Missed this contest? Attempt it on your own clock — same duration, unrated.
        </span>
        <button
          onClick={() =>
            api(`/contests/${contestId}/virtual/start`, { method: "POST" })
              .then(load)
              .catch((e) => setError((e as Error).message))
          }
          className="ml-auto shrink-0 rounded bg-neutral-900 px-4 py-1.5 font-medium text-white dark:bg-white dark:text-neutral-900"
        >
          Start virtual attempt
        </button>
        {error && <p className="text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-900 dark:bg-blue-950">
      {state.running ? (
        <p>
          🕐 Virtual attempt running — ends in{" "}
          <Countdown to={state.virtualEndsAt!} onDone={load} />. Submit from the problem pages;
          your attempt is timed from your own start.
        </p>
      ) : (
        <p>
          Virtual attempt finished
          {standing?.me && (
            <>
              {" "}
              — {standing.me.totalScore} pts, penalty {standing.me.penaltyMin}.
              {standing.wouldBeRank && (
                <>
                  {" "}
                  You would have placed <span className="font-semibold">#{standing.wouldBeRank}</span> of{" "}
                  {standing.officialSize + 1}.
                </>
              )}
            </>
          )}
        </p>
      )}
    </div>
  );
}
