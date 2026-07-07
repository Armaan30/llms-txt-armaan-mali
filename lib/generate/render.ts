import { createHash } from "node:crypto";
import type { PageMeta } from "../crawler/extract";
import type { LlmsTxtPlan } from "./types";

/**
 * Renders a plan into spec-compliant llms.txt markdown (llmstxt.org):
 *
 *   # Site Name            <- required H1
 *   > summary              <- blockquote
 *   ## Section             <- H2 file-list sections
 *   - [title](url): note   <- markdown links, optional note after a colon
 */

export function renderLlmsTxt(plan: LlmsTxtPlan): string {
  const lines: string[] = [];
  lines.push(`# ${inline(plan.siteName)}`);
  lines.push("");
  lines.push(`> ${inline(plan.summary)}`);

  for (const section of plan.sections) {
    lines.push("");
    lines.push(`## ${inline(section.title)}`);
    lines.push("");
    for (const link of section.links) {
      const title = escapeLinkText(inline(link.title)) || link.url;
      const desc = inline(link.description);
      lines.push(desc ? `- [${title}](${link.url}): ${desc}` : `- [${title}](${link.url})`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** Collapse whitespace/newlines — every field renders on a single line. */
function inline(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Square brackets inside link text would break the markdown link. */
function escapeLinkText(s: string): string {
  return s.replace(/([[\]])/g, "\\$1");
}

/**
 * Fingerprint of the crawled inventory, used by the monitoring cron to
 * detect that a site changed. Hashing the extracted (url, title, description)
 * set — rather than raw HTML — ignores markup noise and A/B testing churn.
 */
export function inventoryHash(pages: PageMeta[]): string {
  const lines = pages
    .map((p) => `${p.url}\t${p.title}\t${p.description}`)
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}
