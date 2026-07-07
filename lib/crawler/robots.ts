import { safeFetch } from "./fetch";

/**
 * Minimal robots.txt support: we honor Disallow rules for `*` (and for our
 * own user-agent token) and collect Sitemap directives. We crawl politely —
 * a site that opts out of crawlers gets a llms.txt built from whatever its
 * homepage alone exposes, not a stealth crawl.
 */

export interface RobotsRules {
  disallow: string[];
  allow: string[];
  sitemaps: string[];
}

const EMPTY_RULES: RobotsRules = { disallow: [], allow: [], sitemaps: [] };

export async function fetchRobots(origin: URL): Promise<RobotsRules> {
  try {
    const res = await safeFetch(new URL("/robots.txt", origin));
    if (res.status !== 200) return EMPTY_RULES;
    return parseRobots(res.body);
  } catch {
    return EMPTY_RULES; // unreachable robots.txt = no restrictions
  }
}

export function parseRobots(text: string): RobotsRules {
  const rules: RobotsRules = { disallow: [], allow: [], sitemaps: [] };
  // Consecutive User-agent lines form one group; the rules that follow apply
  // to every agent in that group. A User-agent line after rules starts a new group.
  let groupAgents: string[] = [];
  let groupHasRules = false;

  const appliesToUs = () =>
    groupAgents.some((a) => a === "*" || a.includes("llms-txt-generator"));

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "sitemap") {
      if (value) rules.sitemaps.push(value);
    } else if (field === "user-agent") {
      if (groupHasRules) {
        groupAgents = [];
        groupHasRules = false;
      }
      groupAgents.push(value.toLowerCase());
    } else if (field === "disallow" || field === "allow") {
      groupHasRules = true;
      if (value && appliesToUs()) rules[field].push(value);
    }
  }
  return rules;
}

/** Longest-match wins, per the robots.txt convention. Supports `*` wildcards. */
export function isAllowed(rules: RobotsRules, url: URL): boolean {
  const path = url.pathname + url.search;
  const matchLen = (pattern: string): number => {
    const anchored = pattern.endsWith("$");
    const body = anchored ? pattern.slice(0, -1) : pattern;
    const regex = new RegExp(
      "^" + body.split("*").map(escapeRegex).join(".*") + (anchored ? "$" : ""),
    );
    return regex.test(path) ? pattern.length : -1;
  };
  const bestDisallow = Math.max(...rules.disallow.map(matchLen), -1);
  const bestAllow = Math.max(...rules.allow.map(matchLen), -1);
  return bestAllow >= bestDisallow;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
