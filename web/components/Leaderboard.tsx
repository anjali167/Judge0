"use client";

/**
 * Live leaderboard: joins the contest room over Socket.IO; falls back to
 * 15s polling if the socket can't connect (spec 5.5).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { api, API_URL, getToken } from "@/lib/api";
import type { LeaderboardPayload } from "@/lib/types";

export function Leaderboard({
  contestId,
  problems,
}: {
  contestId: string;
  problems: { id: string; title: string; order: number }[];
}) {
  const [payload, setPayload] = useState<LeaderboardPayload | null>(null);
  const [tab, setTab] = useState<"overall" | "groups">("overall");
  const [live, setLive] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const refresh = () =>
      api<LeaderboardPayload>(`/contests/${contestId}/leaderboard`).then(setPayload).catch(() => {});
    refresh();

    const socket = io(API_URL, { auth: { token: getToken() } });
    socketRef.current = socket;
    socket.on("connect", () => {
      setLive(true);
      socket.emit("join:contest", contestId);
    });
    socket.on("disconnect", () => setLive(false));
    socket.on("leaderboard", (p: LeaderboardPayload) => {
      if (p.contestId === contestId) setPayload(p);
    });

    const poll = setInterval(() => {
      if (!socket.connected) refresh();
    }, 15000);

    return () => {
      socket.emit("leave:contest", contestId);
      socket.disconnect();
      clearInterval(poll);
    };
  }, [contestId]);

  const ordered = useMemo(
    () => [...problems].sort((a, b) => a.order - b.order),
    [problems]
  );

  const groups = useMemo(() => {
    if (!payload) return [];
    const names = Array.from(new Set(payload.rows.map((r) => r.groupName ?? "—"))).sort();
    return names.map((name) => ({
      name,
      rows: payload.rows.filter((r) => (r.groupName ?? "—") === name),
    }));
  }, [payload]);

  if (!payload) return <p className="text-neutral-500">Loading leaderboard…</p>;

  const table = (rows: LeaderboardPayload["rows"], groupRank = false) => (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-neutral-100 text-left dark:bg-neutral-900">
          <tr>
            <th className="px-3 py-2 w-12">#</th>
            <th className="px-3 py-2">Participant</th>
            <th className="px-3 py-2">Group</th>
            {ordered.map((p, i) => (
              <th key={p.id} className="px-3 py-2 text-center" title={p.title}>
                {String.fromCharCode(65 + i)}
              </th>
            ))}
            <th className="px-3 py-2 text-right">Score</th>
            <th className="px-3 py-2 text-right">Penalty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.userId} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="px-3 py-2 font-mono">{groupRank ? i + 1 : r.rank}</td>
              <td className="px-3 py-2">
                <span className="font-medium">{r.name}</span>
                {r.externalId && <span className="ml-2 text-xs text-neutral-500">{r.externalId}</span>}
              </td>
              <td className="px-3 py-2 text-neutral-500">{r.groupName ?? "—"}</td>
              {ordered.map((p) => {
                const cell = r.problems[p.id];
                return (
                  <td key={p.id} className="px-3 py-2 text-center">
                    {cell ? (
                      <span
                        className={
                          cell.solved
                            ? "font-semibold text-green-600 dark:text-green-400"
                            : cell.bestScore > 0
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-red-500"
                        }
                        title={`${cell.attempts} attempt(s)${cell.bestAtMin !== null ? ` · best at ${cell.bestAtMin}min` : ""}`}
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
              <td className="px-3 py-2 text-right text-neutral-500">{r.penaltyMin}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5 + ordered.length} className="px-3 py-8 text-center text-neutral-500">No submissions yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <div className="mb-3 flex items-center gap-4">
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-1 text-sm dark:bg-neutral-900">
          {(["overall", "groups"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 ${tab === t ? "bg-white shadow dark:bg-neutral-700" : "text-neutral-500"}`}
            >
              {t === "overall" ? "Overall" : "By group"}
            </button>
          ))}
        </div>
        <span className={`ml-auto flex items-center gap-1.5 text-xs ${live ? "text-green-600" : "text-neutral-400"}`}>
          <span className={`h-2 w-2 rounded-full ${live ? "bg-green-500" : "bg-neutral-400"}`} />
          {live ? "live" : "polling"}
        </span>
      </div>
      {tab === "overall"
        ? table(payload.rows)
        : groups.map((g) => (
            <div key={g.name} className="mb-6">
              <h3 className="mb-2 font-semibold">{g.name}</h3>
              {table(g.rows, true)}
            </div>
          ))}
    </div>
  );
}
