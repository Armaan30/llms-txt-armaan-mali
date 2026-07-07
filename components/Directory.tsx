"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserId, timeAgo } from "@/lib/client";
import type { PublicSite } from "@/lib/serialize";

/**
 * The public directory: a searchable index of every generated llms.txt,
 * plus a "mine" tab scoped to this browser's anonymous id. Doubles as the
 * cache surface — opening a row is instant, no re-crawl.
 */

type Tab = "all" | "mine";

export default function Directory() {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [sites, setSites] = useState<PublicSite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSites = useCallback(async (activeTab: Tab, q: string): Promise<PublicSite[]> => {
    const params = new URLSearchParams();
    const browserId = getBrowserId();
    if (browserId) params.set("browserId", browserId);
    if (activeTab === "mine") params.set("mine", "1");
    else if (q) params.set("q", q);
    const res = await fetch(`/api/sites?${params}`);
    if (!res.ok) throw new Error("Could not load the directory.");
    const body = (await res.json()) as { sites: PublicSite[] };
    return body.sites;
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSites(tab, "")
      .then((rows) => {
        if (cancelled) return;
        setSites(rows);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Could not load the directory.");
        setSites([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, fetchSites]);

  function handleSearch(value: string) {
    setQuery(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      fetchSites(tab, value)
        .then((rows) => {
          setSites(rows);
          setError(null);
        })
        .catch(() => {
          setError("Could not load the directory.");
          setSites([]);
        });
    }, 250);
  }

  return (
    <section className="space-y-0">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-900 pb-3 dark:border-zinc-100">
        <div className="flex gap-5 font-mono text-xs">
          {(["all", "mine"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`uppercase tracking-widest transition ${
                tab === t
                  ? "text-zinc-900 underline underline-offset-8 dark:text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-700 dark:text-zinc-600 dark:hover:text-zinc-300"
              }`}
            >
              {t === "all" ? "directory" : "my sites"}
            </button>
          ))}
        </div>
        {tab === "all" && (
          <input
            type="search"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="search…"
            className="w-44 border-b border-zinc-300 bg-transparent pb-1 font-mono text-xs outline-none placeholder:text-zinc-400 focus:border-zinc-900 dark:border-zinc-700 dark:placeholder:text-zinc-600 dark:focus:border-zinc-100"
          />
        )}
      </div>

      {error && (
        <p className="py-6 font-mono text-xs text-red-700 dark:text-red-400">{error}</p>
      )}

      {sites === null ? (
        <p className="py-10 text-center font-mono text-xs text-zinc-400 dark:text-zinc-600">
          loading…
        </p>
      ) : sites.length === 0 ? (
        <p className="py-10 text-center font-mono text-xs text-zinc-400 dark:text-zinc-600">
          {tab === "mine"
            ? "you haven't generated any llms.txt files yet"
            : query
              ? "no sites match that search"
              : "no sites in the directory yet — be the first"}
        </p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
              <th className="py-2.5 pr-4 text-left font-normal">domain</th>
              <th className="hidden py-2.5 pr-4 text-left font-normal sm:table-cell">name</th>
              <th className="hidden py-2.5 pr-4 text-right font-normal md:table-cell">pages</th>
              <th className="py-2.5 pr-4 text-left font-normal"></th>
              <th className="py-2.5 text-right font-normal">checked</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => (
              <tr
                key={site.id}
                className="group border-b border-zinc-100 transition hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900/60"
              >
                <td className="py-3 pr-4">
                  <Link
                    href={`/sites/${site.id}`}
                    className="font-mono text-sm font-medium group-hover:underline group-hover:underline-offset-4"
                  >
                    {site.domain}
                  </Link>
                </td>
                <td className="hidden max-w-52 truncate py-3 pr-4 text-sm text-zinc-500 dark:text-zinc-400 sm:table-cell">
                  {site.siteName}
                </td>
                <td className="hidden py-3 pr-4 text-right font-mono text-xs text-zinc-400 dark:text-zinc-600 md:table-cell">
                  {site.pageCount}
                </td>
                <td className="py-3 pr-4 font-mono text-[10px] text-zinc-400 dark:text-zinc-600">
                  {site.usedLlm && <span className="mr-2">[ai]</span>}
                  {site.editedByUser && <span className="mr-2">[edited]</span>}
                  {!site.isListed && <span className="mr-2">[unlisted]</span>}
                </td>
                <td
                  className="py-3 text-right font-mono text-xs text-zinc-400 dark:text-zinc-600"
                  title={`content last updated ${timeAgo(site.updatedAt)}`}
                >
                  {timeAgo(site.lastCheckedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
