import * as cheerio from "cheerio";
import { normalizeUrl, sameSite } from "./url";

/**
 * Per-page metadata extraction. Given raw HTML we pull out the fields the
 * llms.txt needs (title, description, canonical URL) plus the outbound links
 * used by the BFS crawler.
 */

export interface PageMeta {
  url: string; // normalized canonical URL
  title: string;
  description: string;
  /** Same-site links found on the page, normalized. */
  links: string[];
  /** Character count of visible text — near-zero indicates a client-rendered SPA shell. */
  textLength: number;
}

export function extractPage(html: string, pageUrl: URL): PageMeta {
  const $ = cheerio.load(html);

  const canonicalHref = $('link[rel="canonical"]').attr("href");
  let url = pageUrl;
  if (canonicalHref) {
    try {
      const canonical = new URL(canonicalHref, pageUrl);
      if (sameSite(canonical, pageUrl)) url = canonical;
    } catch {
      // ignore malformed canonical
    }
  }

  const title =
    clean($("title").first().text()) ||
    clean($('meta[property="og:title"]').attr("content")) ||
    clean($("h1").first().text());

  const description =
    clean($('meta[name="description"]').attr("content")) ||
    clean($('meta[property="og:description"]').attr("content")) ||
    truncateAtWord(clean($("main p, article p, p").first().text()), 220);

  const links: string[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const target = new URL(href, pageUrl);
      if (target.protocol !== "https:" && target.protocol !== "http:") return;
      if (!sameSite(target, pageUrl)) return;
      const normalized = normalizeUrl(target);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        links.push(normalized);
      }
    } catch {
      // ignore malformed hrefs
    }
  });

  $("script, style, noscript, svg").remove();
  const textLength = $("body").text().replace(/\s+/g, " ").trim().length;

  return { url: normalizeUrl(url), title, description, links, textLength };
}

/** Nav/footer links, extracted separately: they're the site owner's own curation. */
export function extractNavLinks(html: string, pageUrl: URL): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];
  const seen = new Set<string>();
  $("nav a[href], header a[href], footer a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const target = new URL(href, pageUrl);
      if (!sameSite(target, pageUrl)) return;
      const normalized = normalizeUrl(target);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        links.push(normalized);
      }
    } catch {
      // ignore malformed hrefs
    }
  });
  return links;
}

function clean(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Cut at a word boundary so fallback descriptions don't end mid-word. */
function truncateAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}
