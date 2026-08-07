"use client";

/**
 * Anti-cheat telemetry (spec 5.6): reports tab-visibility changes and paste
 * events during a live contest. Signals only — never blocks the participant.
 */
import { useEffect, useRef } from "react";
import { api } from "@/lib/api";

interface Event {
  kind: "TAB_HIDDEN" | "TAB_VISIBLE" | "PASTE";
  at: string;
  meta?: Record<string, unknown>;
}

export function TelemetryReporter({ contestId, active }: { contestId: string; active: boolean }) {
  const queue = useRef<Event[]>([]);

  useEffect(() => {
    if (!active) return;

    const push = (e: Event) => {
      queue.current.push(e);
      if (queue.current.length >= 10) flush();
    };
    const flush = () => {
      if (queue.current.length === 0) return;
      const events = queue.current.splice(0, 50);
      api("/telemetry", { method: "POST", body: { contestId, events } }).catch(() => {});
    };

    const onVisibility = () =>
      push({
        kind: document.hidden ? "TAB_HIDDEN" : "TAB_VISIBLE",
        at: new Date().toISOString(),
      });
    const onPaste = (e: ClipboardEvent) =>
      push({
        kind: "PASTE",
        at: new Date().toISOString(),
        meta: { chars: e.clipboardData?.getData("text").length ?? 0 },
      });

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("paste", onPaste);
    const interval = setInterval(flush, 15000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("paste", onPaste);
      clearInterval(interval);
      flush();
    };
  }, [contestId, active]);

  return null;
}
