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
      <div className="space-y-4 py-12 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
        <Link href="/" className="text-sm text-indigo-600 underline dark:text-indigo-400">
          ← Back to the generator
        </Link>
      </div>
    );
  }
  if (!site) {
    return <p className="py-12 text-center text-sm text-zinc-400">Loading…</p>;
  }

  const dirty = draft !== site.llmsTxt;
  const hostedPath = `/f/${site.id}/llms.txt`;
  const hostedUrl = typeof window !== "undefined" ? window.location.origin + hostedPath : hostedPath;

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{site.siteName}</h1>
          <a
            href={`https://${site.domain}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            {site.domain} ↗
          </a>
        </div>
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          ← All sites
        </Link>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span title={new Date(site.updatedAt).toLocaleString()}>
          Last updated {timeAgo(site.updatedAt)}
        </span>
        <span title={new Date(site.lastCheckedAt).toLocaleString()}>
          Monitored · last checked {timeAgo(site.lastCheckedAt)}
        </span>
        <span>{site.pageCount} pages analyzed</span>
        {site.usedLlm && <span className="text-indigo-600 dark:text-indigo-400">AI-organized</span>}
        {site.editedByUser && <span className="text-amber-600 dark:text-amber-400">human-edited</span>}
        {!site.isListed && <span>unlisted</span>}
      </div>

      {notice && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
          {notice}
        </div>
      )}
      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {actionError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => copyToClipboard(draft, "file")} className={buttonClass}>
          {copied === "file" ? "Copied ✓" : "Copy"}
        </button>
        <button onClick={download} className={buttonClass}>
          Download llms.txt
        </button>
        <button
          onClick={saveEdits}
          disabled={!dirty || saving}
          className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {saving ? "Saving…" : dirty ? "Save edits" : "Saved"}
        </button>
        <button
          onClick={regenerate}
          disabled={regenerating}
          className={`${buttonClass} disabled:opacity-40`}
        >
          {regenerating ? (regenMessage ?? "Regenerating…") : "Regenerate"}
        </button>
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        disabled={regenerating}
        className="h-[28rem] w-full resize-y rounded-lg border border-zinc-200 bg-white p-4 font-mono text-xs leading-relaxed shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900"
      />
      <p className="-mt-3 text-xs text-zinc-400">
        The preview is editable — tweak it, then Save. Copy and Download always use what
        you see here.
      </p>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Hosted file URL
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <a
            href={hostedPath}
            target="_blank"
            rel="noreferrer"
            className="break-all font-mono text-xs text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {hostedUrl}
          </a>
          <button
            onClick={() => copyToClipboard(hostedUrl, "url")}
            className="rounded border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-500 hover:border-indigo-400 dark:border-zinc-700"
          >
            {copied === "url" ? "Copied ✓" : "Copy URL"}
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Always serves the latest saved version — link to it or fetch it from an AI
          system. Updates automatically when the daily monitor detects site changes.
        </p>
      </div>
    </div>
  );
}

const buttonClass =
  "rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-medium shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-indigo-500 dark:hover:text-indigo-400";
