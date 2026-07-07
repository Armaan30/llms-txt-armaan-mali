import { fetchWithRetry } from "./fetch";
import { extractNavLinks, extractPage, type PageMeta } from "./extract";
import { fetchRobots, isAllowed } from "./robots";
import { discoverSitemapUrls } from "./sitemap";
import { selectUrls } from "./prioritize";
import { coerceInputUrl, normalizeUrl, sameSite, UserFacingError } from "./url";

/**
 * Crawl orchestrator.
 *
 * Strategy: robots.txt first (politeness + sitemap discovery), then the
 * sitemap if one exists (full inventory, zero crawling), falling back to a
 * bounded BFS from the homepage. Either way we end with <= MAX_PAGES pages
 * of extracted metadata. Partial failure is fine — pages that error are
 * skipped and reported, not fatal.
 */

const MAX_PAGES = 50;
const MAX_BFS_DEPTH = 3;
const CONCURRENCY = 6;
const CRAWL_TIME_BUDGET_MS = 75_000;
const SPA_TEXT_THRESHOLD = 200; // homepage visible chars below this = SPA shell

export interface CrawlProgress {
  phase: "start" | "robots" | "sitemap" | "fetching";
  message: string;
  fetched?: number;
  total?: number;
}

export interface CrawlResult {
  origin: URL;
  domain: string;
  pages: PageMeta[];
  homepage: PageMeta;
  warnings: string[];
  failedUrls: string[];
  usedSitemap: boolean;
}

export async function crawlSite(
  input: string,
  onProgress: (p: CrawlProgress) => void,
): Promise<CrawlResult> {
  const deadline = Date.now() + CRAWL_TIME_BUDGET_MS;
  const warnings: string[] = [];
  const failedUrls: string[] = [];

  const inputUrl = coerceInputUrl(input);
  onProgress({ phase: "start", message: `Connecting to ${inputUrl.hostname}…` });

  // Homepage first — its final URL (after redirects) is the real origin.
  let homepageRes;
  try {
    homepageRes = await fetchWithRetry(inputUrl);
  } catch (err) {
    if (err instanceof UserFacingError) throw err;
    throw new UserFacingError(
      `Could not reach ${inputUrl.hostname}. The site may be down or blocking requests.`,
    );
  }
  if (homepageRes.status >= 400) {
    throw new UserFacingError(
      `${inputUrl.hostname} responded with HTTP ${homepageRes.status}.`,
    );
  }
  if (!homepageRes.contentType.includes("html")) {
    throw new UserFacingError(`${inputUrl.hostname} did not return an HTML page.`);
  }

  const origin = new URL(homepageRes.finalUrl.origin);
  const homepage = extractPage(homepageRes.body, homepageRes.finalUrl);
  const navUrls = new Set(extractNavLinks(homepageRes.body, homepageRes.finalUrl));

  if (homepage.textLength < SPA_TEXT_THRESHOLD) {
    warnings.push(
      "This site renders mostly in the browser (client-side JavaScript), so page content is limited to metadata. Descriptions may be sparse.",
    );
  }

  onProgress({ phase: "robots", message: "Reading robots.txt…" });
  const robots = await fetchRobots(origin);

  onProgress({ phase: "sitemap", message: "Looking for a sitemap…" });
  const sitemapUrls = await discoverSitemapUrls(origin, robots.sitemaps);
  const usedSitemap = sitemapUrls.length > 0;

  let targets: string[];
  if (usedSitemap) {
    onProgress({
      phase: "sitemap",
      message: `Found sitemap with ${sitemapUrls.length.toLocaleString()} URLs — selecting the most important pages…`,
    });
    const candidates = sitemapUrls.map((u) => normalizeUrl(u));
    targets = selectUrls(candidates, navUrls, MAX_PAGES);
  } else {
    onProgress({
      phase: "sitemap",
      message: "No sitemap found — crawling from the homepage instead…",
    });
    targets = []; // BFS discovers as it goes
  }

  const pagesByUrl = new Map<string, PageMeta>();
  pagesByUrl.set(homepage.url, homepage);

  const fetchOne = async (href: string): Promise<PageMeta | null> => {
    const url = new URL(href);
    if (!sameSite(url, origin) || !isAllowed(robots, url)) return null;
    try {
      const res = await fetchWithRetry(url);
      if (res.status >= 400 || !res.contentType.includes("html")) {
        failedUrls.push(href);
        return null;
      }
      return extractPage(res.body, res.finalUrl);
    } catch {
      failedUrls.push(href);
      return null;
    }
  };

  const reportProgress = () =>
    onProgress({
      phase: "fetching",
      message: `Analyzing pages… (${pagesByUrl.size}/${MAX_PAGES})`,
      fetched: pagesByUrl.size,
      total: MAX_PAGES,
    });

  if (usedSitemap) {
    // Fetch the selected sitemap pages with bounded concurrency.
    const queue = targets.filter((t) => !pagesByUrl.has(t));
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0 && Date.now() < deadline && pagesByUrl.size < MAX_PAGES) {
        const href = queue.shift();
        if (!href) break;
        const page = await fetchOne(href);
        if (page && !pagesByUrl.has(page.url)) {
          pagesByUrl.set(page.url, page);
          reportProgress();
        }
      }
    });
    await Promise.all(workers);
  } else {
    // BFS: start from homepage links, nav links first, depth-limited.
    const visited = new Set<string>([homepage.url]);
    let frontier = [...new Set([...navUrls, ...homepage.links])].filter(
      (h) => !visited.has(h),
    );
    for (let depth = 1; depth <= MAX_BFS_DEPTH; depth++) {
      if (frontier.length === 0 || pagesByUrl.size >= MAX_PAGES) break;
      const layer = selectUrls(frontier, navUrls, MAX_PAGES - pagesByUrl.size);
      const discovered: string[] = [];
      const queue = [...layer];
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length > 0 && Date.now() < deadline && pagesByUrl.size < MAX_PAGES) {
          const href = queue.shift();
          if (!href || visited.has(href)) continue;
          visited.add(href);
          const page = await fetchOne(href);
          if (page && !pagesByUrl.has(page.url)) {
            pagesByUrl.set(page.url, page);
            discovered.push(...page.links);
            reportProgress();
          }
        }
      });
      await Promise.all(workers);
      frontier = [...new Set(discovered)].filter((h) => !visited.has(h));
      if (Date.now() >= deadline) break;
    }
  }

  if (Date.now() >= deadline && pagesByUrl.size < MAX_PAGES) {
    warnings.push("The crawl hit its time budget; results are based on the pages analyzed so far.");
  }
  if (failedUrls.length > 0) {
    warnings.push(`${failedUrls.length} page(s) could not be fetched and were skipped.`);
  }

  const pages = [...pagesByUrl.values()].filter((p) => p.title || p.description);
  if (pages.length === 0) {
    throw new UserFacingError(
      "No readable pages were found on this site. It may be fully client-rendered or blocking crawlers.",
    );
  }

  return {
    origin,
    domain: origin.hostname.toLowerCase().replace(/^www\./, ""),
    pages,
    homepage,
    warnings,
    failedUrls,
    usedSitemap,
  };
}
