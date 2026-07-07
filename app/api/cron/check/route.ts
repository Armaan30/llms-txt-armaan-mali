import { crawlSite } from "@/lib/crawler/crawl";
import { inventoryHash } from "@/lib/generate/render";
import { generateFromCrawl } from "@/lib/generate/pipeline";
import { markChecked, sitesDueForCheck, upsertSite } from "@/lib/db/queries";

/**
 * GET /api/cron/check — the monitoring system (scheduled via vercel.json).
 *
 * Each run re-crawls the sites with the oldest lastCheckedAt, fingerprints
 * the crawled inventory, and compares against the stored hash:
 *   - unchanged            -> just bump lastCheckedAt
 *   - changed              -> regenerate and update the stored llms.txt
 *   - changed but human-edited -> bump lastCheckedAt only; a person curated
 *     that file, so the robot doesn't overwrite it
 *
 * Bounded per run (SITES_PER_RUN) so the function always finishes inside its
 * time limit; the oldest-first ordering makes the schedule round-robin
 * through the whole directory across runs.
 */

export const maxDuration = 300;

const SITES_PER_RUN = 3;

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: { domain: string; outcome: string }[] = [];
  let due;
  try {
    due = await sitesDueForCheck(SITES_PER_RUN);
  } catch (err) {
    console.error("cron: could not load sites:", err);
    return Response.json({ error: "Database unavailable." }, { status: 500 });
  }

  for (const site of due) {
    try {
      const crawl = await crawlSite(site.domain, () => {});
      const freshHash = inventoryHash(crawl.pages);

      if (freshHash === site.contentHash) {
        await markChecked(site.id);
        results.push({ domain: site.domain, outcome: "unchanged" });
      } else if (site.editedByUser) {
        await markChecked(site.id);
        results.push({ domain: site.domain, outcome: "changed-but-user-edited" });
      } else {
        const result = await generateFromCrawl(crawl); // reuse the hash-check crawl
        await upsertSite(result, {
          isListed: site.isListed,
          ownerBrowserId: site.ownerBrowserId,
        });
        results.push({ domain: site.domain, outcome: "regenerated" });
      }
    } catch (err) {
      console.error(`cron: check failed for ${site.domain}:`, err);
      await markChecked(site.id).catch(() => {}); // don't retry a broken site every run
      results.push({ domain: site.domain, outcome: "check-failed" });
    }
  }

  return Response.json({ checked: results.length, results });
}
