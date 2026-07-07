import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { getDb, sites, type Site } from "./index";
import type { GenerateResult } from "../generate/pipeline";

/** All database access for the app, kept in one place. */

export async function getSiteByDomain(domain: string): Promise<Site | undefined> {
  const db = getDb();
  const rows = await db.select().from(sites).where(eq(sites.domain, domain)).limit(1);
  return rows[0];
}

export async function getSiteById(id: string): Promise<Site | undefined> {
  const db = getDb();
  const rows = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  return rows[0];
}

/**
 * Insert or refresh a site from a generation result. On conflict (domain
 * already exists) the content is replaced — callers decide when regeneration
 * is appropriate; this function just persists it.
 */
export async function upsertSite(
  result: GenerateResult,
  opts: { isListed: boolean; ownerBrowserId: string | null },
): Promise<Site> {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .insert(sites)
    .values({
      domain: result.domain,
      siteName: result.siteName,
      llmsTxt: result.llmsTxt,
      contentHash: result.contentHash,
      pageCount: result.pageCount,
      usedLlm: result.usedLlm,
      isListed: opts.isListed,
      ownerBrowserId: opts.ownerBrowserId,
    })
    .onConflictDoUpdate({
      target: sites.domain,
      set: {
        siteName: result.siteName,
        llmsTxt: result.llmsTxt,
        contentHash: result.contentHash,
        pageCount: result.pageCount,
        usedLlm: result.usedLlm,
        editedByUser: false, // fresh generation supersedes manual edits
        updatedAt: now,
        lastCheckedAt: now,
      },
    })
    .returning();
  return rows[0];
}

/** Directory listing: listed sites, optionally filtered by search text. */
export async function listSites(search?: string): Promise<Site[]> {
  const db = getDb();
  const listed = eq(sites.isListed, true);
  const where = search
    ? and(listed, or(ilike(sites.domain, `%${search}%`), ilike(sites.siteName, `%${search}%`)))
    : listed;
  return db.select().from(sites).where(where).orderBy(desc(sites.updatedAt)).limit(60);
}

/** "My sites": everything this browser generated, listed or not. */
export async function listSitesByOwner(ownerBrowserId: string): Promise<Site[]> {
  const db = getDb();
  return db
    .select()
    .from(sites)
    .where(eq(sites.ownerBrowserId, ownerBrowserId))
    .orderBy(desc(sites.updatedAt))
    .limit(60);
}

/** Persist a manual edit; the monitor stops auto-overwriting this site. */
export async function saveManualEdit(id: string, llmsTxt: string): Promise<Site | undefined> {
  const db = getDb();
  const rows = await db
    .update(sites)
    .set({ llmsTxt, editedByUser: true, updatedAt: new Date() })
    .where(eq(sites.id, id))
    .returning();
  return rows[0];
}

/** Sites the monitoring cron should re-check next (oldest checks first). */
export async function sitesDueForCheck(limit: number): Promise<Site[]> {
  const db = getDb();
  return db.select().from(sites).orderBy(asc(sites.lastCheckedAt)).limit(limit);
}

/** Record that the monitor ran and found no content change. */
export async function markChecked(id: string): Promise<void> {
  const db = getDb();
  await db.update(sites).set({ lastCheckedAt: new Date() }).where(eq(sites.id, id));
}
