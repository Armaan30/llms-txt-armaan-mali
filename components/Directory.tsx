"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserId, timeAgo } from "@/lib/client";
import type { PublicSite } from "@/lib/serialize";

/**
 * The public directory: searchable list of every generated llms.txt, plus a
 * "Mine" tab scoped to this browser's anonymous id. Doubles as the cache
 * surface — clicking a card is instant, no re-crawl.
 */

type Tab = "all" | "mine";

export default function Directory() {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [sites, setSites] = useState<PublicSite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (activeTab: Tab, q: string) => {
    const params = new URLSearchParams();
    const browserId = getBrowserId();
    if (browserId) params.set("browserId", browserId);
    if (activeTab === "mine") params.set("mine", "1");
    else if (q) params.set("q", q);
    try {
      const res = await fetch(`/api/sites?${params}`);
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { sites: PublicSite[] };
      setSites(body.sites);
      setError(null);
    } catch {
      setError("Could not load the directory.");
      setSites([]);
    }
  }, []);

  useEffect(() => {
    load(tab, "");
  }, [tab, load]);

  function handleSearch(value: string) {
    setQuery(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(tab, value), 250);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
          {(["all", "mine"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                tab === t
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {t === "all" ? "Directory" : "My sites"}
            </button>
          ))}
        </div>
        {tab === "all" && (
          <input
            type="search"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search sites…"
            className="w-48 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs outline-none placeholder:text-zinc-400 focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
          />
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {sites === null ? (
        <p className="py-8 text-center text-sm text-zinc-400">Loading…</p>
      ) : sites.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-400">
          {tab === "mine"
            ? "You haven't generated any llms.txt files yet."
            : query
              ? "No sites match that search."
              : "No sites in the directory yet — be the first."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {sites.map((site) => (
            <li key={site.id}>
              <Link
                href={`/sites/${site.id}`}
                className="block rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-indigo-400 hover:shadow dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-600"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{site.siteName}</span>
                  <span className="shrink-0 text-xs text-zinc-400">
                    {timeAgo(site.updatedAt)}
                  </span>
                </div>
                <div className="mt-0.5 truncate font-mono text-xs text-zinc-500">
                  {site.domain}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                  <Badge>{site.pageCount} pages</Badge>
                  {site.usedLlm && <Badge tone="indigo">AI-organized</Badge>}
                  {site.editedByUser && <Badge tone="amber">human-edited</Badge>}
                  {!site.isListed && <Badge tone="zinc">unlisted</Badge>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Badge({
  children,
  tone = "zinc",
}: {
  children: React.ReactNode;
  tone?: "zinc" | "indigo" | "amber";
}) {
  const tones = {
    zinc: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    indigo: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 font-medium ${tones[tone]}`}>{children}</span>
  );
}
