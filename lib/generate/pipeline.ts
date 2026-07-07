import { crawlSite, type CrawlProgress, type CrawlResult } from "../crawler/crawl";
import { buildHeuristicPlan } from "./heuristics";
import { llmConfigured, refinePlanWithLlm } from "./llm";
import { inventoryHash, renderLlmsTxt } from "./render";

/**
 * End-to-end generation:
 *
 *   crawl -> extract -> heuristic plan -> LLM refinement -> render
 *
 * The LLM step is best-effort; everything up to it is deterministic, so a
 * generation can never fail because the model was down — it just ships the
 * heuristic version and says so.
 */

export interface GenerateProgress {
  phase: CrawlProgress["phase"] | "organizing" | "rendering";
  message: string;
  fetched?: number;
  total?: number;
}

export interface GenerateResult {
  domain: string;
  siteName: string;
  llmsTxt: string;
  contentHash: string;
  pageCount: number;
  usedSitemap: boolean;
  usedLlm: boolean;
  warnings: string[];
}

export async function generateLlmsTxt(
  input: string,
  onProgress: (p: GenerateProgress) => void = () => {},
): Promise<GenerateResult> {
  const crawl = await crawlSite(input, onProgress);
  return generateFromCrawl(crawl, onProgress);
}

/** Plan + render from an existing crawl (lets the cron reuse its hash-check crawl). */
export async function generateFromCrawl(
  crawl: CrawlResult,
  onProgress: (p: GenerateProgress) => void = () => {},
): Promise<GenerateResult> {
  const warnings = [...crawl.warnings];
  const heuristicPlan = buildHeuristicPlan(crawl.pages, crawl.homepage, crawl.domain);

  let plan = heuristicPlan;
  let usedLlm = false;
  if (llmConfigured()) {
    onProgress({
      phase: "organizing",
      message: `Organizing ${crawl.pages.length} pages with Claude…`,
    });
    const refined = await refinePlanWithLlm(crawl.pages, heuristicPlan, crawl.domain);
    if (refined) {
      plan = refined;
      usedLlm = true;
    } else {
      warnings.push(
        "AI summarization was unavailable, so this file was organized by URL structure alone.",
      );
    }
  } else {
    warnings.push(
      "No ANTHROPIC_API_KEY configured — file organized by URL structure alone.",
    );
  }

  onProgress({ phase: "rendering", message: "Writing llms.txt…" });
  const llmsTxt = renderLlmsTxt(plan);

  return {
    domain: crawl.domain,
    siteName: plan.siteName,
    llmsTxt,
    contentHash: inventoryHash(crawl.pages),
    pageCount: crawl.pages.length,
    usedSitemap: crawl.usedSitemap,
    usedLlm,
    warnings,
  };
}
