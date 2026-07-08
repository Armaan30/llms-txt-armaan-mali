"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserId, streamNdjson, timeAgo } from "@/lib/client";
import type { PublicSite } from "@/lib/serialize";

/**
 * Site detail: the generated llms.txt in an editable preview, with copy /
 * download / save / regenerate actions and the hosted file URL.
 */

type GenerateEvent =
  | { type: "progress"; message: string }
  | { type: "cached"; site: PublicSite }
  | { type: "done"; site: PublicSite; warnings: string[] }
  | { type: "error"; message: string };

const buttonSecondary =
  "border border-zinc-300 px-4 py-2 font-mono text-xs transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:hover:border-zinc-100 dark:hover:text-zinc-100";
const buttonPrimary =
  "border border-zinc-900 bg-zinc-900 px-4 py-2 font-mono text-xs text-white transition hover:bg-zinc-700 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";

export default function SiteView({ id, fromCache }: { id: string; fromCache: boolean }) {
  const [site, setSite] = useState<PublicSite | null>(null);
  const [draft, setDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenMessage, setRegenMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<"file" | "url" | null>(null);
  const [notice, setNotice] = useState<string | null>(
    fromCache ? "This site was already in the directory — showing the existing file." : null,
  );

  // Warn before leaving the page with unsaved edits (owners only — for
  // non-owners local edits are just staging for copy/download).
  useEffect(() => {
    const dirtyNow = site !== null && site.isOwner && draft !== site.llmsTxt;
    if (!dirtyNow) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [site, draft]);

  useEffect(() => {
    (async () => {
      try {
        const browserId = getBrowserId();
        const res = await fetch(`/api/sites/${id}?browserId=${browserId ?? ""}`);
        if (res.status === 404) throw new Error("This site doesn't exist (or was removed).");
        if (!res.ok) throw new Error("Could not load this site.");
        const body = (await res.json()) as { site: PublicSite };
        setSite(body.site);
        setDraft(body.site.llmsTxt);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Could not load this site.");
      }
    })();
  }, [id]);

  if (loadError) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="font-mono text-xs text-red-700 dark:text-red-400">{loadError}</p>
        <Link
          href="/"
          className="font-mono text-xs underline decoration-dotted underline-offset-4"
        >
          ← back to the generator
        </Link>
      </div>
    );
  }
  if (!site) {
    return (
      <p className="py-16 text-center font-mono text-xs text-zinc-400 dark:text-zinc-600">
        loading…
      </p>
    );
  }

  const dirty = draft !== site.llmsTxt;
  const hostedPath = `/f/${site.id}/llms.txt`;
  const hostedUrl =
    typeof window !== "undefined" ? window.location.origin + hostedPath : hostedPath;

  async function copyToClipboard(text: string, which: "file" | "url") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setActionError("Clipboard access was blocked by the browser.");
    }
  }

  function download() {
    const blob = new Blob([draft], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "llms.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function saveEdits() {
    if (!site || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llmsTxt: draft, browserId: getBrowserId() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Could not save your edit.");
      }
      const body = (await res.json()) as { site: PublicSite };
      setSite(body.site);
      setDraft(body.site.llmsTxt);
      setNotice("Saved. The monitor will no longer auto-overwrite this file.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save your edit.");
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    if (!site || regenerating) return;
    if (dirty && !confirm("Regenerating will replace your unsaved edits. Continue?")) return;
    setRegenerating(true);
    setActionError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: site.domain, force: true, browserId: getBrowserId() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Could not regenerate.");
      }
      for await (const event of streamNdjson<GenerateEvent>(res)) {
        if (event.type === "progress") setRegenMessage(event.message);
        else if (event.type === "done" || event.type === "cached") {
          setSite(event.site);
          setDraft(event.site.llmsTxt);
          setNotice("Regenerated from a fresh crawl.");
        } else if (event.type === "error") {
          setActionError(event.message);
        }
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not regenerate.");
    } finally {
      setRegenerating(false);
      setRegenMessage(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-900 pb-5 dark:border-zinc-100">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{site.siteName}</h1>
          <a
            href={`https://${site.domain}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-zinc-500 underline decoration-dotted underline-offset-4 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {site.domain}
          </a>
        </div>
        <Link href="/" className={buttonSecondary}>
          ← all sites
        </Link>
      </div>

      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        <MetaItem label="last checked" value={timeAgo(site.lastCheckedAt)} />
        <MetaItem label="last updated" value={timeAgo(site.updatedAt)} />
        <MetaItem label="pages" value={String(site.pageCount)} />
        <MetaItem
          label="flags"
          value={
            [
              site.usedLlm && "[ai]",
              site.editedByUser && "[edited]",
              !site.isListed && "[unlisted]",
            ]
              .filter(Boolean)
              .join(" ") || "—"
          }
        />
      </dl>

      {notice && (
        <div className="border border-zinc-300 px-4 py-2.5 font-mono text-xs dark:border-zinc-700">
          {notice}
        </div>
      )}
      {actionError && (
        <div className="border border-red-300 px-4 py-2.5 font-mono text-xs text-red-700 dark:border-red-900 dark:text-red-400">
          {actionError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => copyToClipboard(draft, "file")} className={buttonSecondary}>
          {copied === "file" ? "copied ✓" : "copy"}
        </button>
        <button onClick={download} className={buttonSecondary}>
          download
        </button>
        {site.isOwner &&
          (dirty ? (
            <>
              <button onClick={saveEdits} disabled={saving} className={buttonPrimary}>
                {saving ? "saving…" : "save edits"}
              </button>
              <button
                onClick={() => setDraft(site.llmsTxt)}
                disabled={saving}
                className={buttonSecondary}
              >
                discard
              </button>
            </>
          ) : (
            <button disabled className={`${buttonSecondary} cursor-default opacity-40`}>
              saved ✓
            </button>
          ))}
        <button
          onClick={regenerate}
          disabled={regenerating}
          className={`${buttonSecondary} disabled:opacity-40`}
        >
          {regenerating ? (regenMessage ?? "regenerating…") : "regenerate"}
        </button>
        {site.isOwner && dirty && (
          <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
            ● unsaved changes
          </span>
        )}
      </div>

      <div>
        <div className="inline-block border border-b-0 border-zinc-300 px-3 py-1.5 font-mono text-[11px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          llms.txt
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          disabled={regenerating}
          className="block h-[30rem] w-full resize-y border border-zinc-300 bg-transparent p-4 font-mono text-xs leading-relaxed outline-none focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:focus:border-zinc-100"
        />
        <p className="mt-2 font-mono text-[11px] text-zinc-400 dark:text-zinc-600">
          {site.isOwner
            ? "the preview is editable — copy and download always use what you see here"
            : "generated by someone else — edit freely for your own copy/download, but only the original generator can change the shared hosted file"}
        </p>
      </div>

      <div className="border border-zinc-300 p-4 dark:border-zinc-700">
        <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
          hosted file
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <a
            href={hostedPath}
            target="_blank"
            rel="noreferrer"
            className="break-all font-mono text-xs underline decoration-dotted underline-offset-4"
          >
            {hostedUrl}
          </a>
          <button
            onClick={() => copyToClipboard(hostedUrl, "url")}
            className="border border-zinc-300 px-2 py-0.5 font-mono text-[10px] text-zinc-500 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:hover:border-zinc-100 dark:hover:text-zinc-100"
          >
            {copied === "url" ? "copied ✓" : "copy"}
          </button>
        </div>
        <p className="mt-2 font-mono text-[11px] text-zinc-400 dark:text-zinc-600">
          always serves the latest saved version · refreshed automatically by the hourly
          monitor
        </p>
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-xs">{value}</dd>
    </div>
  );
}
