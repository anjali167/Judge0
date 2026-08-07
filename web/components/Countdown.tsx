"use client";

import { useEffect, useState } from "react";

export function Countdown({ to, onDone }: { to: string; onDone?: () => void }) {
  const [remaining, setRemaining] = useState(() => new Date(to).getTime() - Date.now());

  useEffect(() => {
    const t = setInterval(() => {
      const r = new Date(to).getTime() - Date.now();
      setRemaining(r);
      if (r <= 0) {
        clearInterval(t);
        onDone?.();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [to, onDone]);

  if (remaining <= 0) return <span>00:00:00</span>;
  const s = Math.floor(remaining / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const days = Math.floor(s / 86400);
  return (
    <span className="font-mono tabular-nums">
      {days > 0 ? `${days}d ` : ""}
      {pad(Math.floor((s % 86400) / 3600))}:{pad(Math.floor((s % 3600) / 60))}:{pad(s % 60)}
    </span>
  );
}
