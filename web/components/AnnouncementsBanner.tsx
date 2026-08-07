"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import type { Announcement } from "@/lib/types";

export function AnnouncementsBanner() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`${API_URL}/announcements`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setItems)
      .catch(() => {});
  }, []);

  const visible = items.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
      {visible.map((a) => (
        <div key={a.id} className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-2 text-sm">
          <span>📣</span>
          <p className="flex-1">
            <span className="font-semibold">{a.title}</span>
            {" — "}
            {a.body}
          </p>
          <button
            onClick={() => setDismissed(new Set([...dismissed, a.id]))}
            className="text-neutral-400 hover:text-neutral-600"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
