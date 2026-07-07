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
      <div className="flex">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="stripe.com"
          disabled={running}
          autoFocus
          className="min-w-0 flex-1 border border-zinc-300 bg-transparent px-4 py-3 font-mono text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:placeholder:text-zinc-600 dark:focus:border-zinc-100"
        />
        <button
          type="submit"
          disabled={running || !url.trim()}
          className="shrink-0 border border-zinc-900 bg-zinc-900 px-6 py-3 font-mono text-sm text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {running ? "generating…" : "generate"}
        </button>
      </div>

      <label className="flex items-center gap-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">
        <input
          type="checkbox"
          checked={listed}
          onChange={(e) => setListed(e.target.checked)}
          disabled={running}
          className="h-3.5 w-3.5 accent-zinc-900 dark:accent-zinc-100"
        />
        list in the public directory
        <span className="text-zinc-400 dark:text-zinc-600">
          — unlisted files still get a shareable URL
        </span>
      </label>

      {running && (
        <div className="border border-zinc-800 bg-[#0c0c0c] p-4">
          <div className="space-y-1.5 font-mono text-xs">
            {log.slice(0, -1).map((line, i) => (
              <div key={i} className="text-zinc-500">
                <span className="mr-2 text-zinc-600">✓</span>
                {line.message}
              </div>
            ))}
            {current && (
              <div className="text-zinc-100">
                <span className="mr-2 animate-pulse text-zinc-400">▸</span>
                {current.message}
              </div>
            )}
          </div>
          {current?.fetched != null && current.total != null && (
            <div className="mt-3 h-0.5 bg-zinc-800">
              <div
                className="h-full bg-zinc-100 transition-all duration-300"
                style={{ width: `${Math.min(100, (current.fetched / current.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="border border-red-300 px-4 py-3 font-mono text-xs text-red-700 dark:border-red-900 dark:text-red-400">
          {error}
        </div>
      )}
    </form>
  );
}
