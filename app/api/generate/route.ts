import { z } from "zod";
import { coerceInputUrl, normalizeDomain, UserFacingError } from "@/lib/crawler/url";
import { generateLlmsTxt } from "@/lib/generate/pipeline";
import { getSiteByDomain, upsertSite } from "@/lib/db/queries";
import { toPublicSite } from "@/lib/serialize";

/**
 * POST /api/generate — the main endpoint. Streams NDJSON progress events
 * while the crawl runs, ending with a `done` (or `cached` / `error`) event:
 *
 *   {"type":"progress","message":"Analyzing pages… (12/50)","fetched":12,"total":50}
 *   {"type":"done","site":{...}}
 *
 * Generation is idempotent per domain: if the site is already in the
 * directory the cached row is returned instantly; `force: true` (the
 * Regenerate button) re-crawls.
 */

export const maxDuration = 300;

const BodySchema = z.object({
  url: z.string().min(1).max(2048),
  listed: z.boolean().default(true),
  force: z.boolean().default(false),
  browserId: z.string().max(64).nullish(),
});

// Naive per-IP rate limit. In-memory is per-instance, which is fine for the
// abuse case it guards (one client hammering the crawler through one function).
const RATE_LIMIT = 8; // generations per window
const RATE_WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

export async function POST(req: Request): Promise<Response> {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { url, listed, force } = parsed.data;
  const browserId = parsed.data.browserId ?? null;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return Response.json(
      { error: "Too many generations from this address — try again in a few minutes." },
      { status: 429 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      try {
        const inputUrl = coerceInputUrl(url);
        const domain = normalizeDomain(inputUrl.hostname);

        // Cache check. Only listed rows (or the requester's own row) count as
        // hits, so an unlisted generation's existence is never leaked.
        if (!force) {
          const existing = await getSiteByDomain(domain);
          const visible =
            existing && (existing.isListed || existing.ownerBrowserId === browserId);
          if (existing && visible) {
            send({ type: "cached", site: toPublicSite(existing, browserId) });
            controller.close();
            return;
          }
        }

        const result = await generateLlmsTxt(url, (p) => send({ type: "progress", ...p }));
        const site = await upsertSite(result, { isListed: listed, ownerBrowserId: browserId });
        send({
          type: "done",
          site: toPublicSite(site, browserId),
          warnings: result.warnings,
          usedSitemap: result.usedSitemap,
        });
      } catch (err) {
        const message =
          err instanceof UserFacingError
            ? err.message
            : "Something went wrong while generating. Please try again.";
        if (!(err instanceof UserFacingError)) console.error("generate failed:", err);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
