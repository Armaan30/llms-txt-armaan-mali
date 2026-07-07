import { getSiteById } from "@/lib/db/queries";

/**
 * GET /f/:id/llms.txt — the hosted file. Serves the generated markdown as
 * plain text so a site owner (or an AI system) can consume it directly.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const site = await getSiteById(id);
    if (!site) return new Response("Not found\n", { status: 404 });
    return new Response(site.llmsTxt, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=60", // 1 min — edits/regenerations show up fast
        "Last-Modified": site.updatedAt.toUTCString(),
      },
    });
  } catch (err) {
    console.error("hosted file failed:", err);
    return new Response("Service unavailable\n", { status: 503 });
  }
}
