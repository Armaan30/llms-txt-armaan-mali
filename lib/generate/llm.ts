import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { PageMeta } from "../crawler/extract";
import type { LlmsTxtPlan } from "./types";

/**
 * LLM refinement step. Claude sees the crawled page inventory and produces
 * the final plan: a real prose summary, better grouping, and one-line link
 * descriptions. The API's structured-output mode guarantees the response
 * parses against the schema, so the only failure modes are transport-level —
 * and the caller falls back to the heuristic plan for those.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const LLM_TIMEOUT_MS = 90_000;

const PlanSchema = z.object({
  siteName: z.string(),
  summary: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
      links: z.array(
        z.object({
          url: z.string(),
          description: z.string(),
        }),
      ),
    }),
  ),
});

export function llmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Returns a refined plan, or null if the LLM step fails for any reason —
 * the pipeline treats null as "ship the heuristic plan".
 */
export async function refinePlanWithLlm(
  pages: PageMeta[],
  heuristicPlan: LlmsTxtPlan,
  domain: string,
): Promise<LlmsTxtPlan | null> {
  if (!llmConfigured()) return null;

  const client = new Anthropic();

  const inventory = pages
    .map((p) => `- ${p.url}\n  title: ${p.title || "(none)"}\n  description: ${truncate(p.description, 200) || "(none)"}`)
    .join("\n");

  const prompt = `You are generating an llms.txt file (see llmstxt.org) for the website "${domain}".

Below is the crawled page inventory. Organize it into an llms.txt plan:

1. siteName: the site's proper name (e.g. "Stripe", not "Stripe | Payments").
2. summary: 1-2 sentences describing what the site/company is and offers, written for an AI system that needs to understand the site quickly. Factual, no marketing fluff.
3. sections: group the pages under clear H2 section titles (e.g. "Documentation", "Products", "Blog", "Company"). Rules:
   - Only use URLs from the inventory below. Never invent or modify URLs.
   - Give every link a concise one-line description (rewrite weak meta descriptions; write one from the title/URL if missing).
   - Put secondary/low-value pages (legal, deep reference pages, individual old posts) in a section titled exactly "Optional" — llms.txt readers may skip it.
   - Omit pages that add nothing (duplicates, empty pages). Aim for the most useful 20-40 links, not all of them.
   - Order sections by importance; order links within a section from general to specific.

Draft grouping from a rule-based pass, which you may reorganize freely:
${heuristicPlan.sections.map((s) => `## ${s.title}\n${s.links.map((l) => `- ${l.url}`).join("\n")}`).join("\n")}

Page inventory:
${inventory}`;

  try {
    const response = await client.messages.parse(
      {
        model: MODEL,
        max_tokens: 16000,
        messages: [{ role: "user", content: prompt }],
        output_config: { format: zodOutputFormat(PlanSchema) },
      },
      { timeout: LLM_TIMEOUT_MS, maxRetries: 1 },
    );
    const parsed = response.parsed_output;
    if (!parsed) return null;
    return sanitize(parsed, pages, heuristicPlan);
  } catch (err) {
    console.error("LLM refinement failed, using heuristic plan:", err);
    return null;
  }
}

/**
 * Trust but verify: drop any URL Claude didn't get from us, re-attach page
 * titles from the crawl (the model only writes descriptions), and reject
 * degenerate results.
 */
function sanitize(
  raw: z.infer<typeof PlanSchema>,
  pages: PageMeta[],
  heuristicPlan: LlmsTxtPlan,
): LlmsTxtPlan | null {
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const sections = raw.sections
    .map((s) => ({
      title: s.title.trim() || "Resources",
      links: s.links
        .filter((l) => byUrl.has(l.url))
        .map((l) => ({
          url: l.url,
          title: byUrl.get(l.url)!.title || l.url,
          description: truncate(l.description.replace(/\s+/g, " ").trim(), 250),
        })),
    }))
    .filter((s) => s.links.length > 0);

  if (sections.length === 0) return null;
  return {
    siteName: raw.siteName.trim() || heuristicPlan.siteName,
    summary: raw.summary.replace(/\s+/g, " ").trim() || heuristicPlan.summary,
    sections,
  };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}
