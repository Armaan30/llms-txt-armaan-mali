import type { PageMeta } from "../crawler/extract";
import type { LlmsTxtPlan, PlanSection } from "./types";

/**
 * Deterministic categorization: maps pages into llms.txt sections from URL
 * path keywords alone. This is the guaranteed floor — it always works, costs
 * nothing, and is what ships if the LLM refinement step fails.
 */

const SECTION_RULES: { title: string; pattern: RegExp }[] = [
  {
    title: "Documentation",
    pattern:
      /^(docs?|documentation|guides?|learn|tutorials?|reference|api|developers?|help|support|faq|kb|knowledge-?base)$/i,
  },
  {
    title: "Blog & News",
    pattern: /^(blog|news|articles?|posts?|changelog|updates|stories|insights)$/i,
  },
  {
    title: "Products & Services",
    pattern:
      /^(products?|features?|pricing|plans|solutions?|services?|shop|store|collections?|menu|integrations?|templates?|use-?cases?)$/i,
  },
  {
    title: "Company",
    pattern:
      /^(about|about-?us|company|team|careers?|jobs|contact|contact-?us|customers?|press|partners?|investors?|mission)$/i,
  },
];

const LEGAL_PATTERN = /^(legal|privacy|terms|security|cookies?|gdpr|compliance|accessibility)$/i;
const SECTION_LINK_CAP = 12;
const OPTIONAL_LINK_CAP = 15;

export function buildHeuristicPlan(
  pages: PageMeta[],
  homepage: PageMeta,
  domain: string,
): LlmsTxtPlan {
  const siteName = inferSiteName(homepage, domain);
  const summary =
    homepage.description ||
    homepage.title ||
    `Website at ${domain}.`;

  const buckets = new Map<string, PageMeta[]>();
  const put = (section: string, page: PageMeta) => {
    const list = buckets.get(section) ?? [];
    list.push(page);
    buckets.set(section, list);
  };

  for (const page of pages) {
    if (page.url === homepage.url) continue; // homepage feeds the summary, not a section
    const segments = pathSegments(page.url);
    const first = segments[0] ?? "";

    if (LEGAL_PATTERN.test(first)) {
      put("Optional", page);
      continue;
    }
    const rule = SECTION_RULES.find((r) => r.pattern.test(first));
    if (rule) {
      put(rule.title, page);
    } else if (segments.length <= 1) {
      put("Resources", page); // shallow page without a recognized section
    } else {
      put("Optional", page); // deep uncategorized pages are skippable context
    }
  }

  const sectionOrder = [
    "Documentation",
    "Products & Services",
    "Blog & News",
    "Resources",
    "Company",
    "Optional",
  ];

  const sections: PlanSection[] = [];
  for (const title of sectionOrder) {
    const bucket = buckets.get(title);
    if (!bucket || bucket.length === 0) continue;
    // Shallower pages first within a section — they're the entry points.
    bucket.sort((a, b) => pathSegments(a.url).length - pathSegments(b.url).length);
    const cap = title === "Optional" ? OPTIONAL_LINK_CAP : SECTION_LINK_CAP;
    sections.push({
      title,
      links: bucket.slice(0, cap).map((p) => ({
        url: p.url,
        title: p.title || fallbackTitle(p.url),
        description: p.description,
      })),
    });
  }

  return { siteName, summary, sections };
}

/**
 * "Stripe | Payments infrastructure" -> "Stripe";
 * "Agentic Infrastructure - Vercel"  -> "Vercel" (segment matching the domain wins).
 */
export function inferSiteName(homepage: PageMeta, domain: string): string {
  const raw = homepage.title;
  if (!raw) return domain;
  const segments = raw
    .split(/\s*[|\\·•—–:]\s*|\s+-\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return domain;
  const root = domain.split(".")[0].toLowerCase();
  const matching = segments.find((s) => s.toLowerCase().includes(root));
  return matching ?? segments[0];
}

function pathSegments(href: string): string[] {
  try {
    return new URL(href).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
}

/** Turn "/docs/getting-started" into "Getting Started" when a page has no title. */
function fallbackTitle(href: string): string {
  const segments = pathSegments(href);
  const last = segments[segments.length - 1] ?? "";
  const words = last.replace(/[-_]+/g, " ").trim();
  return words.replace(/\b\w/g, (c) => c.toUpperCase()) || href;
}
