"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getBrowserId, streamNdjson } from "@/lib/client";
import type { PublicSite } from "@/lib/serialize";

/**
 * URL input + live crawl progress. Generation streams NDJSON events from
 * /api/generate, so the user watches the crawl happen (robots -> sitemap ->
 * pages -> Claude) instead of staring at a spinner.
 */

type GenerateEvent =
  | { type: "progress"; message: string; fetched?: number; total?: number }
  | { type: "cached"; site: PublicSite }
  | { type: "done"; site: PublicSite; warnings: string[] }
  | { type: "error"; message: string };

interface LogLine {
  message: string;
  fetched?: number;
  total?: number;
}

export default function GenerateForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [listed, setListed] = useState(true);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (running || !url.trim()) return;
    setRunning(true);
    setError(null);
    setLog([]);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, listed, browserId: getBrowserId() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (HTTP ${res.status}).`);
      }

      for await (const event of streamNdjson<GenerateEvent>(res)) {
        if (event.type === "progress") {
          setLog((prev) => {
            // Collapse repeated fetch-counter updates into one line.
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && event.fetched && last.fetched) next[next.length - 1] = event;
            else next.push(event);
            return next;
          });
        } else if (event.type === "cached") {
          router.push(`/sites/${event.site.id}?cached=1`);
          return;
        } else if (event.type === "done") {
          router.push(`/sites/${event.site.id}`);
          return;
        } else if (event.type === "error") {
          setError(event.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setRunning(false);
    }
  }

  const current = log[log.length - 1];

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="stripe.com"
          disabled={running}
          autoFocus
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 font-mono text-sm shadow-sm outline-none placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={running || !url.trim()}
          className="shrink-0 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Generating…" : "Generate"}
        </button>
      </div>

      <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <input
          type="checkbox"
          checked={listed}
          onChange={(e) => setListed(e.target.checked)}
          disabled={running}
          className="h-3.5 w-3.5 accent-indigo-600"
        />
        List in the public directory (uncheck for an unlisted result — it still gets a
        shareable URL)
      </label>

      {running && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="space-y-1.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {log.slice(0, -1).map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                {line.message}
              </div>
            ))}
            {current && (
              <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border border-indigo-500 border-t-transparent" />
                {current.message}
              </div>
            )}
          </div>
          {current?.fetched != null && current.total != null && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${Math.min(100, (current.fetched / current.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}
    </form>
  );
}
