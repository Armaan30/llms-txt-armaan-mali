/**
 * URL selection. An llms.txt is a *curation*, not an index — given hundreds
 * or thousands of candidate URLs we pick the ~50 most representative pages
 * to actually fetch. Selection is score-based:
 *
 *  - shallow paths beat deep ones (homepage-adjacent pages describe the site)
 *  - pages linked from the site's own nav/footer get a strong boost
 *  - noise (auth, carts, feeds, pagination) is dropped outright
 *  - non-default locales are dropped so /fr/ /de/ ... don't drown the list
 *  - repetitive templated sections (e.g. 900 product pages) are capped so
 *    e-commerce catalogs don't crowd out the pages that describe the store
 */

const NOISE_PATTERNS: RegExp[] = [
  /\/(login|logout|signin|signup|sign-in|sign-up|register|account|cart|checkout|admin|wp-admin|wp-json)(\/|$)/i,
  /\/(feed|rss|atom)(\/|$)/i,
  /\.(pdf|jpg|jpeg|png|gif|webp|svg|ico|css|js|json|xml|zip|gz|mp4|mp3|woff2?)$/i,
  /[?&](page|p)=\d/i, // pagination
  /\/page\/\d+(\/|$)/i,
  /\/(tag|tags|category|categories|author)\/[^/]+\/page(\/|$)/i,
];

// Two-letter (optionally region-qualified) locale prefixes: /fr/, /pt-br/, /zh-CN/...
const LOCALE_PREFIX = /^\/([a-z]{2})(-[a-z]{2})?(\/|$)/i;
const ENGLISH_PREFIXES = new Set(["en", "en-us", "en-gb"]);

const TEMPLATED_SECTION_CAP = 6; // max pages fetched per repetitive section
const TEMPLATED_SECTION_THRESHOLD = 20; // a section this large is "templated"

export function selectUrls(
  candidates: string[],
  navUrls: Set<string>,
  limit: number,
): string[] {
  const parsed = candidates
    .map((href) => {
      try {
        return { href, url: new URL(href) };
      } catch {
        return null;
      }
    })
    .filter((x): x is { href: string; url: URL } => x !== null)
    .filter(({ url }) => !NOISE_PATTERNS.some((p) => p.test(url.pathname + url.search)))
    .filter(({ url }) => keepLocale(url.pathname));

  // Count pages per first path segment to detect templated sections.
  const sectionCounts = new Map<string, number>();
  for (const { url } of parsed) {
    const section = firstSegment(url.pathname);
    sectionCounts.set(section, (sectionCounts.get(section) ?? 0) + 1);
  }

  const scored = parsed.map(({ href, url }) => {
    const depth = url.pathname.split("/").filter(Boolean).length;
    let score = 100 - depth * 15;
    if (navUrls.has(href)) score += 40;
    if (url.pathname === "/") score += 50;
    return { href, url, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const picked: string[] = [];
  const takenPerSection = new Map<string, number>();
  for (const { href, url } of scored) {
    if (picked.length >= limit) break;
    const section = firstSegment(url.pathname);
    const sectionSize = sectionCounts.get(section) ?? 0;
    const taken = takenPerSection.get(section) ?? 0;
    if (sectionSize >= TEMPLATED_SECTION_THRESHOLD && taken >= TEMPLATED_SECTION_CAP) {
      continue; // templated section already represented
    }
    takenPerSection.set(section, taken + 1);
    picked.push(href);
  }
  return picked;
}

function keepLocale(pathname: string): boolean {
  const match = pathname.match(LOCALE_PREFIX);
  if (!match) return true;
  const prefix = (match[1] + (match[2] ?? "")).toLowerCase();
  // Keep English variants; also keep prefixes that are common words, not locales.
  if (ENGLISH_PREFIXES.has(prefix)) return true;
  const NOT_LOCALES = new Set(["ai", "go", "js", "ts", "ui", "us", "vs", "db"]);
  if (!match[2] && NOT_LOCALES.has(prefix)) return true;
  return false;
}

function firstSegment(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "";
}
