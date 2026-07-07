import { generateLlmsTxt } from "../lib/generate/pipeline";
import { upsertSite } from "../lib/db/queries";

/**
 * Seeds the directory by running the real generation pipeline against a
 * deliberately diverse set of sites — docs-heavy, e-commerce, a plain-HTML
 * blog, and llmstxt.org itself — so the deployed app starts populated and
 * the variety of site types is demonstrated with honest output.
 *
 * Usage: npm run seed   (requires DATABASE_URL; ANTHROPIC_API_KEY optional)
 */

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file may not exist — fine
  }
}

const SEED_SITES = [
  "vercel.com", // large docs site with a sitemap
  "stripe.com", // docs + marketing at scale
  "anthropic.com", // AI company site
  "allbirds.com", // e-commerce (templated product pages)
  "paulgraham.com", // plain-HTML blog, no sitemap (BFS path)
  "llmstxt.org", // the spec itself
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — see README.md.");
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠ ANTHROPIC_API_KEY not set — seeds will use heuristic organization only.\n");
  }

  for (const target of SEED_SITES) {
    process.stdout.write(`→ ${target} … `);
    try {
      const result = await generateLlmsTxt(target);
      await upsertSite(result, { isListed: true, ownerBrowserId: null });
      console.log(
        `ok (${result.pageCount} pages, ${result.usedSitemap ? "sitemap" : "crawl"}, ${result.usedLlm ? "AI" : "heuristic"})`,
      );
    } catch (err) {
      console.log(`failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  process.exit(0);
}

main();
