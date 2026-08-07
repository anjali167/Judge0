"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CommentView } from "@/lib/types";

export function Discussion({ problemId }: { problemId: string }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentView[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ open: boolean; comments: CommentView[] }>(`/problems/${problemId}/comments`)
      .then((r) => {
        setOpen(r.open);
        setComments(r.comments);
      })
      .catch(() => {});
  }, [problemId]);

  if (!open) return null;

  const post = async () => {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const c = await api<CommentView>(`/problems/${problemId}/comments`, {
        method: "POST",
        body: { body: body.trim() },
      });
      setComments([...comments, c]);
      setBody("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <h2 className="mb-3 font-semibold">Discussion ({comments.length})</h2>
      <div className="space-y-3">
        {comments.map((c) => (
          <div key={c.id} className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            <p className="mb-1 text-xs text-neutral-500">
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{c.user.name}</span>
              {" · "}
              {new Date(c.createdAt).toLocaleString()}
            </p>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </div>
        ))}
        {comments.length === 0 && (
          <p className="text-sm text-neutral-500">No comments yet — start the discussion.</p>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Share your approach…"
          className="flex-1 rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          onClick={post}
          disabled={busy || !body.trim()}
          className="self-end rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          Post
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
