import * as cheerio from "cheerio";
import { safeFetch } from "./fetch";
import { sameSite } from "./url";

/**
 * Sitemap discovery. A sitemap gives us the site's full URL inventory in one
 * request, so it's always preferred over crawling. Handles sitemap-index
 * files (one level deep) and caps total URLs so a huge site can't blow the
 * time budget.
 */

const MAX_URLS = 2_000;
const MAX_CHILD_SITEMAPS = 5;

const CANDIDATE_PATHS = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml"];

export async function discoverSitemapUrls(
  origin: URL,
  robotsSitemaps: string[],
): Promise<URL[]> {
  const candidates = [
    ...robotsSitemaps,
    ...CANDIDATE_PATHS.map((p) => new URL(p, origin).href),
  ];

  for (const candidate of candidates) {
    let url: URL;
    try {
      url = new URL(candidate, origin);
    } catch {
      continue;
    }
    if (!sameSite(url, origin)) continue;
    const urls = await readSitemap(url, origin, true);
    if (urls.length > 0) return urls.slice(0, MAX_URLS);
  }
  return [];
}

async function readSitemap(url: URL, origin: URL, allowIndex: boolean): Promise<URL[]> {
  let body: string;
  try {
    const res = await safeFetch(url);
    if (res.status !== 200) return [];
    body = res.body;
  } catch {
    return [];
  }

  const $ = cheerio.load(body, { xmlMode: true });

  // Sitemap-index: recurse one level into the first few child sitemaps.
  const children = $("sitemapindex > sitemap > loc")
    .map((_, el) => $(el).text().trim())
    .get();
  if (children.length > 0 && allowIndex) {
    const results: URL[] = [];
    for (const child of children.slice(0, MAX_CHILD_SITEMAPS)) {
      try {
        const childUrl = new URL(child);
        if (!sameSite(childUrl, origin)) continue;
        results.push(...(await readSitemap(childUrl, origin, false)));
      } catch {
        // skip malformed child entries
      }
      if (results.length >= MAX_URLS) break;
    }
    return results;
  }

  const urls: URL[] = [];
  $("urlset > url > loc").each((_, el) => {
    try {
      const u = new URL($(el).text().trim());
      if (sameSite(u, origin)) urls.push(u);
    } catch {
      // skip malformed entries
    }
  });
  return urls;
}
