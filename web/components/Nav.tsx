"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, API_URL, getToken, setToken } from "@/lib/api";
import type { InstanceInfo, User } from "@/lib/types";

export function Nav() {
  const [user, setUser] = useState<User | null>(null);
  const [instanceName, setInstanceName] = useState("Contests");

  useEffect(() => {
    fetch(`${API_URL}/instance`)
      .then((r) => r.json())
      .then((i: InstanceInfo) => i.name && setInstanceName(i.name))
      .catch(() => {});
    if (!getToken()) return;
    api<User>("/auth/me").then(setUser).catch(() => {});
  }, []);

  return (
    <nav className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link href="/contests" className="font-bold tracking-tight">
          ⚡ {instanceName}
        </Link>
        <Link href="/problems" className="text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white">
          Practice
        </Link>
        <div className="ml-auto flex items-center gap-4 text-sm">
          {user ? (
            <>
              <span className="text-neutral-500">{user.name}</span>
              <button
                className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-300"
                onClick={() => {
                  setToken(null);
                  window.location.href = "/login";
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login">Sign in</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
